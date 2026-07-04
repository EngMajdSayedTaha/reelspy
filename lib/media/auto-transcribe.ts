// Post-sync auto-transcribe (W5/V2), now a producer for the durable queue (V4).
// Right after a sync lands reels, enqueue `transcribe_reel` jobs for the user's
// top untranscribed reels so their hooks/scripts are ready when opened. The cron
// worker (`/api/cron/run-jobs`) does the actual Whisper work with full quota
// discipline — this call just fans out jobs and returns immediately, so the sync
// response is never blocked and nothing runs detached in the request lifetime.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueueJob } from "@/lib/jobs/queue";
import { transcriptionConfigured } from "@/lib/media/transcribe-job";
import { numEnv } from "@/lib/utils/env";

function autoTranscribeEnabled(): boolean {
  // Default ON; set AUTO_TRANSCRIBE_AFTER_SYNC=false to disable.
  return process.env.AUTO_TRANSCRIBE_AFTER_SYNC?.trim().toLowerCase() !== "false";
}

type Candidate = { id: string };

// Enqueue transcribe jobs for the top-N highest-scoring untranscribed reels.
// Best-effort: never throws (it runs from a fire-and-forget `after()` in sync).
// Dedup keys (`transcribe:<reelId>`) make re-syncs idempotent — a reel already
// queued/running won't be enqueued twice.
export async function enqueueTopReelTranscriptions(
  admin: SupabaseClient,
  userId: string
): Promise<void> {
  if (!autoTranscribeEnabled() || !transcriptionConfigured()) return;

  const topN = Math.max(0, numEnv("AUTO_TRANSCRIBE_TOP_N", 3));
  if (topN === 0) return;

  try {
    // Highest-scoring reels never transcribed. Skip 'failed'/'pending' so a bad
    // reel isn't re-queued each sync and an in-flight run isn't duplicated.
    const { data, error } = await admin
      .from("tracked_reels")
      .select("id")
      .eq("user_id", userId)
      .eq("is_discarded", false)
      .or("transcript_status.is.null,transcript_status.eq.none")
      .order("viral_score", { ascending: false, nullsFirst: false })
      .limit(topN)
      .returns<Candidate[]>();

    if (error || !data || data.length === 0) return;

    for (const reel of data) {
      await enqueueJob(admin, {
        kind: "transcribe_reel",
        payload: { reel_id: reel.id, user_id: userId },
        userId,
        dedupKey: `transcribe:${reel.id}`,
      });
    }
  } catch (err) {
    console.warn(
      "[auto-transcribe] enqueue aborted:",
      err instanceof Error ? err.message : err
    );
  }
}
