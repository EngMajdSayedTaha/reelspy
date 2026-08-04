import { NextResponse, after } from "next/server";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { cronAuthorized } from "@/lib/utils/cron";
import { numEnv } from "@/lib/utils/env";
import {
  claimJobs,
  completeJob,
  deferJob,
  enqueueJob,
  failJob,
  jitterMs,
  type Job,
  type JobKind,
} from "@/lib/jobs/queue";
import { readAppPausedUntil } from "@/lib/instagram/rate-limit";
import { dispatchPost } from "@/lib/publishing/dispatcher";
import { runTranscribeReel, RETRYABLE_OUTCOMES } from "@/lib/media/transcribe-job";
import { runSendDigest } from "@/lib/email/digest-job";
import { runRefreshSnapshot, RETRYABLE_REFRESH_OUTCOMES } from "@/lib/jobs/refresh-snapshot-job";
import { runArchiveAccount } from "@/lib/jobs/archive-account-job";

// Durable job-queue worker (H1 / roadmap V4). Claims due `jobs` rows and runs
// them by kind: scheduled publishing, post-sync auto-transcribe, and weekly
// digest sends. Replaces the old inline `publish-due` loop. On Vercel Hobby the
// frequent cron slots are spent, so this is triggered from GitHub Actions
// (.github/workflows/run-jobs.yml, every 5 min) — swap to a Vercel cron
// (`*/2 * * * *`) once on Pro (see docs/cron-cadence.md). Auth via CRON_SECRET.
export const runtime = "nodejs";
export const maxDuration = 300;

const KINDS: JobKind[] = [
  "publish_post",
  "transcribe_reel",
  "send_digest",
  "refresh_snapshot",
  "archive_account",
];

// Both kinds spend Business Discovery calls, so both pace and both get parked
// when the shared circuit is open.
const META_KINDS: ReadonlySet<JobKind> = new Set(["refresh_snapshot", "archive_account"]);

// Pause between consecutive jobs that actually call Meta. Without this the worker
// fires Business Discovery back-to-back — a fresh 100-account "Sync All" becomes
// dozens of calls in seconds and trips Instagram's app-level ceiling on its own,
// long before the userbase is big enough to matter. The inline sync route paces
// identically (app/api/ig/sync/route.ts).
const REFRESH_PACE_MS = numEnv("REFRESH_JOB_PACE_MS", 300);
// Spread for deferred wake-ups so a whole cooldown's worth of jobs don't resume
// in lockstep.
const DEFER_JITTER_MS = numEnv("REFRESH_DEFER_JITTER_MS", 60_000);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// What a job run tells the loop: whether it spent a Meta call (so the next
// Meta-bound job gets paced) and whether it was deferred rather than completed.
type JobRun = { hitMeta: boolean; deferred: boolean };

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

async function runJob(admin: ReturnType<typeof createAdminClient>, job: Job): Promise<JobRun> {
  switch (job.kind) {
    case "publish_post": {
      const postId = String(job.payload.post_id ?? "");
      if (!postId) throw new Error("publish_post job missing post_id");
      await dispatchPost(admin, postId); // idempotent (pending-jobs-only)
      await completeJob(admin, job.id);
      return { hitMeta: false, deferred: false };
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
      return { hitMeta: false, deferred: false };
    }
    case "send_digest": {
      const userId = String(job.payload.user_id ?? job.user_id ?? "");
      if (!userId) throw new Error("send_digest job missing user_id");
      await runSendDigest(admin, userId); // throws on send failure → reschedules
      await completeJob(admin, job.id);
      return { hitMeta: false, deferred: false };
    }
    case "refresh_snapshot": {
      const username = String(job.payload.ig_username ?? "");
      if (!username) throw new Error("refresh_snapshot job missing ig_username");
      const maxReels = Number(job.payload.max_reels) || undefined;
      const outcome = await runRefreshSnapshot(admin, username, maxReels);

      // A throttle is "not now", not "broken" — defer to when the shared circuit
      // actually reopens WITHOUT spending an attempt, so the job outlives a full
      // 1-hour Meta cooldown instead of dying inside it.
      if (outcome === "throttled") {
        const pausedUntil = await readAppPausedUntil(admin);
        const resumeAt = new Date(
          (pausedUntil ? new Date(pausedUntil).getTime() : Date.now() + 60_000) +
            jitterMs(DEFER_JITTER_MS)
        );
        await deferJob(admin, job, resumeAt, `throttled — waiting until ${resumeAt.toISOString()}`);
        return { hitMeta: true, deferred: true };
      }

      if (RETRYABLE_REFRESH_OUTCOMES.has(outcome)) {
        // `no_token` — a genuine fault (nobody has a healthy IG connection).
        await failJob(admin, job, new Error(`refresh outcome: ${outcome}`));
        return { hitMeta: false, deferred: false };
      }

      await completeJob(admin, job.id);
      // not_found / failed still consumed a Business Discovery call, so they pace.
      return { hitMeta: outcome !== "skipped", deferred: false };
    }
    case "archive_account": {
      const username = String(job.payload.ig_username ?? "");
      if (!username) throw new Error("archive_account job missing ig_username");
      const since = job.payload.since == null ? null : String(job.payload.since);
      const outcome = await runArchiveAccount(admin, username, { since });

      if (outcome === "throttled") {
        const pausedUntil = await readAppPausedUntil(admin);
        const resumeAt = new Date(
          (pausedUntil ? new Date(pausedUntil).getTime() : Date.now() + 60_000) +
            jitterMs(DEFER_JITTER_MS)
        );
        await deferJob(admin, job, resumeAt, `throttled — waiting until ${resumeAt.toISOString()}`);
        return { hitMeta: true, deferred: true };
      }

      if (outcome === "no_token") {
        await failJob(admin, job, new Error("archive outcome: no_token"));
        return { hitMeta: false, deferred: false };
      }

      // The walk is chunked, so "continued" means this pass did its share and
      // the next one picks up from the saved cursor. The follow-up job can only
      // be enqueued AFTER this one is completed — they share a dedup key, and
      // the partial unique index counts the in-flight job as the active holder.
      await completeJob(admin, job.id);

      if (outcome === "continued") {
        await enqueueJob(admin, {
          kind: "archive_account",
          payload: { ig_username: username, since },
          userId: job.user_id,
          dedupKey: `archive:${username}`,
          // A Meta cooldown can park a chunk for a full hour, and a deep archive
          // is many chunks. Deferrals are attempt-neutral, but leave headroom.
          maxAttempts: 10,
        });
      }

      // A `completed` that was answered from the shared cache spent nothing, but
      // one that finished a walk did. Pacing a cache hit costs 300ms; skipping a
      // pace after a real call costs shared budget, so err toward pacing.
      return { hitMeta: outcome !== "skipped", deferred: false };
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
  let deferred = 0;
  let processed = 0;

  // Read the shared circuit breaker ONCE per pass when Meta-bound work is in the
  // batch. If Instagram is cooling down, every refresh job is parked in one go
  // rather than each one waking, failing, and burning an attempt against a door
  // we already know is closed.
  const pausedUntil = claimed.some((j) => META_KINDS.has(j.kind))
    ? await readAppPausedUntil(admin)
    : null;

  let lastHitMeta = false;

  for (const job of claimed) {
    // Leave headroom so we don't get killed mid-job; the lease reclaims anything
    // left `running` past the lock timeout on a later pass.
    if (Date.now() - startedAt > budgetMs) break;

    if (META_KINDS.has(job.kind) && pausedUntil) {
      const resumeAt = new Date(new Date(pausedUntil).getTime() + jitterMs(DEFER_JITTER_MS));
      await deferJob(admin, job, resumeAt, `circuit open — waiting until ${resumeAt.toISOString()}`);
      deferred++;
      continue;
    }

    // Pace only between jobs that actually reach Meta — cache hits and non-Meta
    // kinds need no throttle.
    if (META_KINDS.has(job.kind) && lastHitMeta && REFRESH_PACE_MS > 0) {
      await sleep(REFRESH_PACE_MS);
    }

    processed++;
    try {
      const result = await runJob(admin, job);
      lastHitMeta = result.hitMeta;
      if (result.deferred) deferred++;
      else done++;
    } catch (err) {
      lastHitMeta = false;
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

  // GitHub Actions' `*/5 * * * *` is the CONFIGURED cadence, not the ACTUAL one —
  // scheduled runs are best-effort and can land 45+ minutes apart under load
  // (see docs/cron-cadence.md). A queued job's `run_at` says when it becomes
  // ELIGIBLE, not when the next pass will actually happen, so it can't answer
  // "when will this run" on its own. Recording every real invocation here —
  // whether it came from GitHub, a manual admin trigger, or the leftover-drain
  // self-call above — gives the ops panel something honest to show instead: how
  // long it's actually been since the worker last looked, which the admin can
  // read against the queued job's `run_at` themselves. Best-effort: a failed
  // write here must never take an otherwise-successful pass down with it.
  try {
    await admin.from("app_settings").upsert(
      {
        key: "run_jobs_heartbeat",
        value: {
          at: new Date().toISOString(),
          worker,
          reconciled,
          claimed: claimed.length,
          processed,
          done,
          retried,
          deferred,
          failed,
          throttled: Boolean(pausedUntil) || undefined,
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );
  } catch (err) {
    console.warn("[run-jobs] heartbeat write failed:", err instanceof Error ? err.message : err);
  }

  return NextResponse.json({
    ok: true,
    worker,
    reconciled,
    claimed: claimed.length,
    processed,
    done,
    retried,
    // Parked until Meta's cooldown clears — not failures, and not attempts spent.
    deferred,
    failed,
    throttled: Boolean(pausedUntil) || undefined,
    resumesAt: pausedUntil ?? undefined,
  });
}
