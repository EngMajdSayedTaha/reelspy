// Bulk transcription of one tracked account's reels — the "transcribe everything
// this account ever posted" half of turning an archive into something an AI can
// read.
//
// Why it can't be one loop, and why it isn't a fan-out either:
//
//   - A fully archived account runs to thousands of reels, and each one is a
//     yt-dlp extraction plus a Whisper call. That is hours of work; a serverless
//     invocation is minutes.
//   - Enqueuing one `transcribe_reel` job per reel (the obvious fan-out) looks
//     tempting and is wrong: the hourly transcript throttle admits ~20/hour, so
//     the other 1,980 jobs would wake, be throttled, and burn their attempt
//     budget on a door we already know is shut — arriving at `failed` hours
//     before they could ever have run.
//
// So this is a CHUNKED, RESUMABLE walk in the shape of archive-account-job.ts:
// transcribe a few reels, re-enqueue, repeat. The difference is that it needs no
// cursor table — `tracked_reels.transcript_status` IS the progress state, so a
// pass simply asks for the next reels that still lack a transcript. That makes
// it self-healing: a reel transcribed manually in the meantime just isn't
// selected, and a crashed pass loses nothing.
//
// Service-role only.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runTranscribeReel, transcriptionConfigured } from "@/lib/media/transcribe-job";
import { numEnv } from "@/lib/utils/env";

// Reels per worker pass. Deliberately small: the hourly throttle admits ~20/hour
// anyway, so a bigger chunk would only queue up throttled attempts, and a pass
// that runs long risks being killed mid-reel.
const REELS_PER_RUN = numEnv("TRANSCRIBE_ACCOUNT_PER_RUN", 5);
// Wall-clock ceiling for one pass, and the reason it is well under the worker's
// own ~260s budget: `transcribe_reel` work is far heavier per job than anything
// else in the queue, and the worker drains one shared batch. A pass allowed to
// run for minutes would spend the whole budget on one account and leave due
// scheduled posts sitting until the next cron tick. At roughly 15-20s a reel
// this still clears more per hour than the hourly transcript throttle admits, so
// the cap costs no real throughput. The loop always runs at least one reel, so
// forward progress can't stall however tight this gets.
const RUN_BUDGET_MS = numEnv("TRANSCRIBE_ACCOUNT_BUDGET_MS", 60_000);
// Breathing room between reels so a chunk doesn't arrive at Whisper as a burst.
const REEL_PACE_MS = numEnv("TRANSCRIBE_ACCOUNT_PACE_MS", 500);

export type TranscribeAccountOutcome =
  | "completed" // nothing left needing a transcript
  | "continued" // chunk done, more remain — worker re-enqueues
  | "throttled" // hourly throttle or provider 429 — defer, attempt-neutral
  | "quota_exceeded" // monthly plan cap spent — park until it resets
  | "skipped"; // transcription unconfigured, or the account is gone

export type TranscribeAccountResult = {
  outcome: TranscribeAccountOutcome;
  // Reels this pass actually wrote a transcript for.
  transcribed: number;
  // Reels still lacking one when the pass ended.
  remaining: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type Candidate = { id: string };

// Reels eligible for bulk transcription: not discarded, and never successfully
// transcribed. `failed` is excluded on purpose — a reel that genuinely can't be
// transcribed (no audio, deleted, permanently private) would otherwise be
// retried on every pass forever, and a whole account of them would never let the
// run finish. Genuinely transient failures no longer land in `failed` at all
// (see the retryable branch in transcribe-job.ts), so this exclusion costs
// nothing real. `pending` is excluded because another run holds it.
// The select options are taken at construction rather than chained on, so the
// counting and the listing forms of this query cannot drift apart.
function pendingReelsQuery(
  admin: SupabaseClient,
  userId: string,
  accountId: string,
  options?: { head: boolean; count: "exact" }
) {
  return admin
    .from("tracked_reels")
    .select("id", options)
    .eq("user_id", userId)
    .eq("account_id", accountId)
    .eq("is_discarded", false)
    .or("transcript_status.is.null,transcript_status.eq.none");
}

// How many reels are still waiting. Read after the chunk so the caller can tell
// "continued" from "completed" without guessing.
async function countRemaining(
  admin: SupabaseClient,
  userId: string,
  accountId: string
): Promise<number> {
  const { count, error } = await pendingReelsQuery(admin, userId, accountId, {
    head: true,
    count: "exact",
  });
  if (error) throw new Error(`remaining-reel count failed: ${error.message}`);
  return count ?? 0;
}

// Transcribe the next chunk of one account's untranscribed reels.
//
// Never throws for an expected condition — the outcome carries it — but a
// genuinely broken read (RLS, missing column) does throw, so the worker's
// backoff retries rather than reporting a bogus "completed".
export async function runTranscribeAccount(
  admin: SupabaseClient,
  accountId: string,
  userId: string
): Promise<TranscribeAccountResult> {
  if (!transcriptionConfigured()) {
    return { outcome: "skipped", transcribed: 0, remaining: 0 };
  }

  // The account may have been removed since the run was queued.
  const { data: account } = await admin
    .from("inspiration_accounts")
    .select("id")
    .eq("id", accountId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!account) return { outcome: "skipped", transcribed: 0, remaining: 0 };

  // Highest-scoring first: if the plan's monthly quota runs out halfway (and on
  // the free tier it will, at five), the transcripts the user got are the ones
  // most worth having rather than whichever reels happened to sort first.
  const { data, error } = await pendingReelsQuery(admin, userId, accountId)
    .order("viral_score", { ascending: false, nullsFirst: false })
    .limit(Math.max(1, REELS_PER_RUN))
    .returns<Candidate[]>();

  if (error) throw new Error(`transcribe candidates unreadable: ${error.message}`);

  const candidates = data ?? [];
  if (candidates.length === 0) {
    return { outcome: "completed", transcribed: 0, remaining: 0 };
  }

  const startedAt = Date.now();
  let transcribed = 0;

  for (const [index, reel] of candidates.entries()) {
    // Stop cleanly rather than being killed mid-reel; the next pass resumes from
    // whatever is still untranscribed.
    if (index > 0 && Date.now() - startedAt > RUN_BUDGET_MS) break;
    if (index > 0 && REEL_PACE_MS > 0) await sleep(REEL_PACE_MS);

    const outcome = await runTranscribeReel(admin, reel.id, userId, "transcript_bulk");

    if (outcome === "throttled" || outcome === "quota_exceeded") {
      // Both are "come back later", and both already released the reel, so the
      // work done so far stands and the run resumes where it stopped.
      return {
        outcome,
        transcribed,
        remaining: await countRemaining(admin, userId, accountId),
      };
    }

    // `failed` is terminal for that one reel and must not stop the account:
    // a single removed reel shouldn't strand the other 500. It's excluded from
    // future passes by the candidate query, so the run still terminates.
    if (outcome === "ready") transcribed += 1;
  }

  const remaining = await countRemaining(admin, userId, accountId);
  return {
    outcome: remaining > 0 ? "continued" : "completed",
    transcribed,
    remaining,
  };
}
