// Auto-transcribe the top untranscribed reels right after a sync (W5/V2), so a
// user's best inspiration reels already have a transcript (and a hook) by the
// time they open them — the "instant" feel instead of "click and wait 90s".
//
// Runs inline via `after()` from the sync route (no durable queue until H1/V4),
// so it is deliberately budget-bounded: it processes reels newest-highest-score
// first, stops when a wall-clock budget is spent, and respects the same hourly +
// monthly transcript quotas as a manual transcribe. Best-effort throughout — a
// failure on one reel never throws out of the background task.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { processReel } from "@/lib/media/pipeline";
import { resolveUserTier } from "@/lib/ai/tier";
import { consumeMonthlyQuota } from "@/lib/billing/quota";
import { consumeUserAction } from "@/lib/utils/user-rate-limit";
import { track } from "@/lib/analytics/track";
import { numEnv } from "@/lib/utils/env";

// Transcription needs a Whisper provider; without one the pipeline would fail
// every reel. Skip auto-transcription entirely so we never spuriously mark a
// user's top reels "failed" on a server that isn't configured for it.
function transcriptionConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY?.trim() || process.env.HF_API_TOKEN?.trim());
}

function autoTranscribeEnabled(): boolean {
  // Default ON; set AUTO_TRANSCRIBE_AFTER_SYNC=false to disable.
  return process.env.AUTO_TRANSCRIBE_AFTER_SYNC?.trim().toLowerCase() !== "false";
}

function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("auto-transcribe deadline")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}

type Candidate = { id: string; ig_permalink: string };

// Transcribe up to N of the user's highest-scoring untranscribed reels within a
// wall-clock budget. Uses the service-role client (safe in an `after()` context,
// no cookie dependency) but attributes quota to the real user via p_user_id.
export async function autoTranscribeTopReels(
  admin: SupabaseClient,
  userId: string
): Promise<void> {
  if (!autoTranscribeEnabled() || !transcriptionConfigured()) return;

  const topN = Math.max(0, numEnv("AUTO_TRANSCRIBE_TOP_N", 3));
  if (topN === 0) return;
  const budgetMs = numEnv("AUTO_TRANSCRIBE_BUDGET_MS", 220_000);
  const startedAt = Date.now();

  try {
    // Highest-scoring reels that have never been transcribed. We skip 'failed'
    // and 'pending' so a bad reel isn't re-attempted on every sync and an
    // in-flight manual run isn't duplicated.
    const { data, error } = await admin
      .from("tracked_reels")
      .select("id, ig_permalink")
      .eq("user_id", userId)
      .eq("is_discarded", false)
      .or("transcript_status.is.null,transcript_status.eq.none")
      .order("viral_score", { ascending: false, nullsFirst: false })
      .limit(topN)
      .returns<Candidate[]>();

    if (error || !data || data.length === 0) return;

    const tier = await resolveUserTier(admin, userId);

    for (const reel of data) {
      // Leave enough headroom to actually finish a reel; if the budget is nearly
      // spent, stop rather than start a run we can't complete.
      const elapsed = Date.now() - startedAt;
      const remaining = budgetMs - elapsed;
      if (remaining < 30_000) break;

      // Same guards as a manual transcribe: hourly throttle then monthly plan
      // quota. A denied monthly quota means the tier's cap is hit — stop the
      // whole batch; a denied hourly throttle likewise means back off.
      const hourly = await consumeUserAction(admin, userId, "transcript");
      if (!hourly.allowed) break;

      const quota = await consumeMonthlyQuota(admin, userId, tier, "transcripts_mo");
      if (!quota.allowed) break;

      // Claim the reel (best-effort) so a concurrent sync won't also pick it.
      await admin
        .from("tracked_reels")
        .update({ transcript_status: "pending" })
        .eq("id", reel.id)
        .eq("user_id", userId);

      try {
        const perReelDeadline = Math.min(remaining, 150_000);
        const result = await withDeadline(processReel(reel.ig_permalink), perReelDeadline);

        if (result.status !== "ready") {
          // Mark failed (not back to 'none') so it isn't re-attempted next sync.
          await admin
            .from("tracked_reels")
            .update({ transcript_status: "failed" })
            .eq("id", reel.id)
            .eq("user_id", userId);
          continue;
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
          .eq("id", reel.id)
          .eq("user_id", userId);

        void track(userId, "transcript_ready", {
          source: result.source,
          lang: result.language,
          via: "auto",
        });
      } catch (err) {
        console.warn(
          `[auto-transcribe] reel=${reel.id} failed:`,
          err instanceof Error ? err.message : err
        );
        await admin
          .from("tracked_reels")
          .update({ transcript_status: "failed" })
          .eq("id", reel.id)
          .eq("user_id", userId);
      }
    }
  } catch (err) {
    // Never let the background task throw — it runs detached from the response.
    console.warn(
      "[auto-transcribe] batch aborted:",
      err instanceof Error ? err.message : err
    );
  }
}
