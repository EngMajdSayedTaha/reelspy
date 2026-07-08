// Per-reel transcription runner for the durable queue (V4). This is the work a
// `transcribe_reel` job performs: the exact quota discipline of a manual
// transcribe (hourly throttle → monthly plan quota), then the Whisper pipeline,
// writing the transcript back. Producers (post-sync auto-transcribe) enqueue
// jobs via `enqueueTopReelTranscriptions`; the cron worker calls this.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { processReel } from "@/lib/media/pipeline";
import { resolveUserEntitlements } from "@/lib/billing/resolve";
import { consumeMonthlyQuota } from "@/lib/billing/quota";
import { consumeUserAction } from "@/lib/utils/user-rate-limit";
import { track } from "@/lib/analytics/track";
import { numEnv } from "@/lib/utils/env";

// Transcription needs a Whisper provider; without one the pipeline fails every
// reel. Callers should skip enqueuing entirely when unconfigured.
export function transcriptionConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY?.trim() || process.env.HF_API_TOKEN?.trim());
}

export type TranscribeOutcome =
  | "ready" // transcript written
  | "failed" // reel unavailable / pipeline error — reel marked failed, don't retry
  | "throttled" // hourly limit hit — reschedule the job
  | "quota_exceeded" // monthly plan cap hit — released, retry next cycle
  | "skipped"; // not configured / reel gone

// Outcomes the worker should reschedule (transient) vs. treat as terminal.
export const RETRYABLE_OUTCOMES: ReadonlySet<TranscribeOutcome> = new Set(["throttled"]);

function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("transcribe deadline")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}

// Transcribe one reel end-to-end. Idempotent-ish: a reel already `ready` is left
// alone; a missing reel is a no-op. Attributes quota to the owning user.
export async function runTranscribeReel(
  admin: SupabaseClient,
  reelId: string,
  userId: string
): Promise<TranscribeOutcome> {
  if (!transcriptionConfigured()) return "skipped";

  const { data: reel } = await admin
    .from("tracked_reels")
    .select("id, ig_permalink, transcript_status")
    .eq("id", reelId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!reel) return "skipped";
  if ((reel as { transcript_status: string | null }).transcript_status === "ready") {
    return "ready"; // already done by a manual run — nothing to do
  }
  const permalink = (reel as { ig_permalink: string }).ig_permalink;

  const { entitlements } = await resolveUserEntitlements(admin, userId);

  // Same guards as a manual transcribe: hourly throttle then monthly plan quota.
  const hourly = await consumeUserAction(admin, userId, "transcript");
  if (!hourly.allowed) return "throttled";

  const quota = await consumeMonthlyQuota(admin, userId, entitlements, "transcripts_mo");
  if (!quota.allowed) {
    // Cap hit — release the claim so the reel can be picked up next cycle.
    await admin
      .from("tracked_reels")
      .update({ transcript_status: "none" })
      .eq("id", reelId)
      .eq("user_id", userId);
    return "quota_exceeded";
  }

  await admin
    .from("tracked_reels")
    .update({ transcript_status: "pending" })
    .eq("id", reelId)
    .eq("user_id", userId);

  try {
    const deadline = numEnv("TRANSCRIBE_JOB_DEADLINE_MS", 150_000);
    const result = await withDeadline(processReel(permalink), deadline);

    if (result.status !== "ready") {
      await admin
        .from("tracked_reels")
        .update({ transcript_status: "failed" })
        .eq("id", reelId)
        .eq("user_id", userId);
      return "failed";
    }

    await admin
      .from("tracked_reels")
      .update({
        transcript: result.text,
        transcript_srt: result.srt,
        transcript_lang: result.language,
        transcript_source: result.source,
        transcript_status: "ready",
        transcript_generated_at: new Date().toISOString(),
      })
      .eq("id", reelId)
      .eq("user_id", userId);

    void track(userId, "transcript_ready", {
      source: result.source,
      lang: result.language,
      via: "auto",
    });
    return "ready";
  } catch (err) {
    console.warn(
      `[transcribe-job] reel=${reelId} failed:`,
      err instanceof Error ? err.message : err
    );
    await admin
      .from("tracked_reels")
      .update({ transcript_status: "failed" })
      .eq("id", reelId)
      .eq("user_id", userId);
    return "failed";
  }
}
