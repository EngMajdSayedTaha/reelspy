import { NextResponse, after } from "next/server";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { cronAuthorized } from "@/lib/utils/cron";
import { numEnv } from "@/lib/utils/env";
import {
  claimJobs,
  completeJob,
  enqueueJob,
  failJob,
  type Job,
  type JobKind,
} from "@/lib/jobs/queue";
import { dispatchPost } from "@/lib/publishing/dispatcher";
import { runTranscribeReel, RETRYABLE_OUTCOMES } from "@/lib/media/transcribe-job";
import { runSendDigest } from "@/lib/email/digest-job";
import { runRefreshSnapshot, RETRYABLE_REFRESH_OUTCOMES } from "@/lib/jobs/refresh-snapshot-job";

// Durable job-queue worker (H1 / roadmap V4). Claims due `jobs` rows and runs
// them by kind: scheduled publishing, post-sync auto-transcribe, and weekly
// digest sends. Replaces the old inline `publish-due` loop. On Vercel Hobby the
// frequent cron slots are spent, so this is triggered from GitHub Actions
// (.github/workflows/run-jobs.yml, every 5 min) — swap to a Vercel cron
// (`*/2 * * * *`) once on Pro (see docs/cron-cadence.md). Auth via CRON_SECRET.
export const runtime = "nodejs";
export const maxDuration = 300;

const KINDS: JobKind[] = ["publish_post", "transcribe_reel", "send_digest", "refresh_snapshot"];

// Enqueue publish jobs for any scheduled post that's past due but has no active
// job — covers posts scheduled before the queue existed and any missed enqueue.
// Idempotent via the `publish:<id>` dedup key.
async function reconcileDuePublishPosts(admin: ReturnType<typeof createAdminClient>): Promise<number> {
  const { data: due } = await admin
    .from("publish_posts")
    .select("id")
    .eq("status", "scheduled")
    .not("scheduled_at", "is", null)
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(numEnv("PUBLISH_RECONCILE_BATCH", 50))
    .returns<{ id: string }[]>();

  let queued = 0;
  for (const post of due ?? []) {
    const { skipped } = await enqueueJob(admin, {
      kind: "publish_post",
      payload: { post_id: post.id },
      dedupKey: `publish:${post.id}`,
    });
    if (!skipped) queued++;
  }
  return queued;
}

async function runJob(admin: ReturnType<typeof createAdminClient>, job: Job): Promise<void> {
  switch (job.kind) {
    case "publish_post": {
      const postId = String(job.payload.post_id ?? "");
      if (!postId) throw new Error("publish_post job missing post_id");
      await dispatchPost(admin, postId); // idempotent (pending-jobs-only)
      await completeJob(admin, job.id);
      return;
    }
    case "transcribe_reel": {
      const reelId = String(job.payload.reel_id ?? "");
      const userId = String(job.payload.user_id ?? job.user_id ?? "");
      if (!reelId || !userId) throw new Error("transcribe_reel job missing reel_id/user_id");
      const outcome = await runTranscribeReel(admin, reelId, userId);
      if (RETRYABLE_OUTCOMES.has(outcome)) {
        // Transient (hourly throttle) — reschedule with backoff.
        await failJob(admin, job, new Error(`transcribe outcome: ${outcome}`));
      } else {
        await completeJob(admin, job.id);
      }
      return;
    }
    case "send_digest": {
      const userId = String(job.payload.user_id ?? job.user_id ?? "");
      if (!userId) throw new Error("send_digest job missing user_id");
      await runSendDigest(admin, userId); // throws on send failure → reschedules
      await completeJob(admin, job.id);
      return;
    }
    case "refresh_snapshot": {
      const username = String(job.payload.ig_username ?? "");
      if (!username) throw new Error("refresh_snapshot job missing ig_username");
      const maxReels = Number(job.payload.max_reels) || undefined;
      const outcome = await runRefreshSnapshot(admin, username, maxReels);
      if (RETRYABLE_REFRESH_OUTCOMES.has(outcome)) {
        // Shared limiter closed / no healthy token — reschedule with backoff.
        await failJob(admin, job, new Error(`refresh outcome: ${outcome}`));
      } else {
        await completeJob(admin, job.id);
      }
      return;
    }
  }
}

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const worker = `run-jobs:${randomUUID().slice(0, 8)}`;
  const batch = numEnv("JOBS_BATCH", 15);
  const budgetMs = numEnv("JOBS_BUDGET_MS", 260_000);
  const startedAt = Date.now();

  let reconciled = 0;
  try {
    reconciled = await reconcileDuePublishPosts(admin);
  } catch (err) {
    console.warn("[run-jobs] reconcile failed:", err instanceof Error ? err.message : err);
  }

  const claimed = await claimJobs(admin, worker, KINDS, batch);

  let done = 0;
  let retried = 0;
  let failed = 0;
  let processed = 0;

  for (const job of claimed) {
    // Leave headroom so we don't get killed mid-job; the lease reclaims anything
    // left `running` past the lock timeout on a later pass.
    if (Date.now() - startedAt > budgetMs) break;
    processed++;
    try {
      await runJob(admin, job);
      done++;
    } catch (err) {
      const result = await failJob(admin, job, err);
      if (result.retried) retried++;
      else failed++;
      console.warn(
        `[run-jobs] job=${job.id} kind=${job.kind} error:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  // If we claimed a full batch and had budget left, there may be more due jobs —
  // kick another pass after the response so a backlog drains without waiting for
  // the next cron tick.
  const leftover = claimed.length >= batch && Date.now() - startedAt < budgetMs;
  if (leftover) {
    after(async () => {
      try {
        await fetch(new URL("/api/cron/run-jobs", request.url), {
          headers: { authorization: request.headers.get("authorization") ?? "" },
        });
      } catch {
        // Best-effort backlog drain; the next scheduled tick is the safety net.
      }
    });
  }

  return NextResponse.json({
    ok: true,
    worker,
    reconciled,
    claimed: claimed.length,
    processed,
    done,
    retried,
    failed,
  });
}
