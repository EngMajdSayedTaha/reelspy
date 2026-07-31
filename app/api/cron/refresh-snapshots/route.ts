import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createMetaRateLimiter,
  refreshHourlyBudget,
  SYSTEM_USER_ID,
  WORKER_BUDGET_SHARE,
} from "@/lib/instagram/rate-limit";
import { refreshAccountSnapshot, pickHealthyToken } from "@/lib/instagram/snapshots";
import { enrichSeedAccounts } from "@/lib/instagram/enrich";
import { cronAuthorized } from "@/lib/utils/cron";
import { numEnv } from "@/lib/utils/env";

// Scheduled worker: keeps the GLOBAL snapshot cache warm so on-demand sync is
// (almost) always a cheap DB read. It fetches the UNIQUE set of tracked public
// accounts — once each per run — through the shared MetaRateLimiter, so the
// token bucket and circuit breaker govern it just like user traffic.
export const runtime = "nodejs";
export const maxDuration = 300;

const BATCH = numEnv("SNAPSHOT_REFRESH_BATCH", 50);
const SEED_BATCH = numEnv("SEED_ENRICH_BATCH", 100);
const TTL_SECONDS = numEnv("SNAPSHOT_TTL_SECONDS", 21600);
const REQUEUE_BATCH = numEnv("REFRESH_REQUEUE_BATCH", 100);

type Admin = ReturnType<typeof createAdminClient>;

// Safety net for stranded background refreshes.
//
// A `refresh_snapshot` job that exhausts its attempts parks as `failed`, and
// nothing else would ever revive it — that account's reels stay frozen forever
// while the UI happily shows an old timestamp. Throttles no longer consume
// attempts (lib/jobs/queue.ts `deferJob`), so reaching `failed` is now rare, but
// "rare" isn't "never" and a stranded account is invisible to the user.
//
// Revive the row in place rather than inserting a duplicate, and skip any handle
// that already has an active job — the partial unique index on `dedup_key`
// (status in queued/running) would reject it anyway.
async function requeueStrandedRefreshJobs(
  admin: Admin,
  isStale: (username: string) => boolean
): Promise<number> {
  const { data: failedJobs } = await admin
    .from("jobs")
    .select("id, payload, dedup_key")
    .eq("kind", "refresh_snapshot")
    .eq("status", "failed")
    .order("updated_at", { ascending: true })
    .limit(REQUEUE_BATCH);

  if (!failedJobs?.length) return 0;

  const { data: activeJobs } = await admin
    .from("jobs")
    .select("dedup_key")
    .eq("kind", "refresh_snapshot")
    .in("status", ["queued", "running"]);
  const activeKeys = new Set((activeJobs ?? []).map((j) => j.dedup_key).filter(Boolean));

  const nowIso = new Date().toISOString();
  let revived = 0;

  for (const job of failedJobs) {
    const username = String(
      (job.payload as Record<string, unknown> | null)?.ig_username ?? ""
    ).toLowerCase();
    // Only revive accounts someone still tracks and whose data is actually stale.
    if (!username || !isStale(username)) continue;
    if (job.dedup_key && activeKeys.has(job.dedup_key)) continue;

    const { error } = await admin
      .from("jobs")
      .update({
        status: "queued",
        attempts: 0,
        run_at: nowIso,
        last_error: "requeued by refresh-snapshots (was stranded)",
        locked_at: null,
        locked_by: null,
        updated_at: nowIso,
      })
      .eq("id", job.id);

    if (!error) {
      revived += 1;
      if (job.dedup_key) activeKeys.add(job.dedup_key);
    }
  }

  return revived;
}

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Resize the shared app-wide budget to the current connected-user count before
  // spending (Meta's ceiling scales ~200/hr per user). Also the worker's own cap.
  const budget = await refreshHourlyBudget(admin);

  // A single healthy token is enough — Business Discovery reads any public
  // account, and the rate limit is app-level.
  const caller = await pickHealthyToken(admin);
  if (!caller) {
    return NextResponse.json({ ok: true, processed: 0, note: "No connected accounts yet." });
  }

  // Unique set of active tracked usernames across ALL users (the dedup payoff).
  const { data: rows } = await admin
    .from("inspiration_accounts")
    .select("ig_username")
    .eq("is_active", true);

  const allUsernames = Array.from(
    new Set((rows ?? []).map((r) => String(r.ig_username).toLowerCase()))
  );

  // Prioritize the stalest accounts. Pull current snapshot freshness in one go.
  const { data: snaps } = await admin
    .from("ig_account_snapshots")
    .select("ig_username, last_fetched_at, last_status");

  const freshness = new Map(
    (snaps ?? []).map((s) => [s.ig_username, { at: s.last_fetched_at, status: s.last_status }])
  );

  const now = Date.now();
  const trackedUsernames = new Set(allUsernames);
  const isStale = (u: string): boolean => {
    const f = freshness.get(u);
    if (!f || !f.at || f.status !== "ok") return true;
    return new Date(f.at).getTime() + TTL_SECONDS * 1000 <= now;
  };
  // Worth reviving a stranded job for: still tracked, still stale, and not a dead
  // handle — `not_found` is terminal here just as it is in seed enrichment, so a
  // private/non-business account never re-spends quota.
  const worthRequeueing = (u: string): boolean =>
    trackedUsernames.has(u) && freshness.get(u)?.status !== "not_found" && isStale(u);

  const stale = allUsernames
    .filter(isStale)
    .sort((a, b) => {
      const ta = freshness.get(a)?.at ? new Date(freshness.get(a)!.at as string).getTime() : 0;
      const tb = freshness.get(b)?.at ? new Date(freshness.get(b)!.at as string).getTime() : 0;
      return ta - tb; // oldest first
    })
    .slice(0, BATCH);

  // System limiter. The worker isn't a real user, so it isn't held to a user's
  // cap — but it must not take the whole bucket either. Batch work used to be
  // allowed the FULL app budget, so a big refresh run could drain it and leave
  // someone clicking Sync with an `app_budget` denial they had no way to
  // understand. Capping the worker leaves that share as interactive headroom.
  const limiter = createMetaRateLimiter(
    admin,
    SYSTEM_USER_ID,
    Math.max(1, Math.floor(budget * WORKER_BUDGET_SHARE))
  );

  let processed = 0;
  let refreshed = 0;
  let rateLimited = false;
  let invalidToken = false;

  for (const username of stale) {
    const result = await refreshAccountSnapshot(admin, limiter, caller.igUserId, caller.token, username);
    processed += 1;
    if (result.fetched) refreshed += 1;

    if (result.rateLimited) {
      rateLimited = true;
      break; // circuit is (about to be) open — stop hammering
    }

    // If the worker's token is dead, flag it for the token cron and stop; the
    // next run will pick a different healthy token.
    if (result.status === "error" && /access token|session|#190/i.test(result.error ?? "")) {
      await admin.from("profiles").update({ ig_token_status: "invalid" }).eq("id", caller.userId);
      invalidToken = true;
      break;
    }
  }

  // Also drain a batch of the cold-start seed pool (seed_accounts) with whatever
  // Meta budget remains this run. Live tracked accounts above are processed first
  // so seeds never starve them; skipped entirely if the token died or we're being
  // throttled. This is what keeps the seed suggestions warm daily without a
  // dedicated cron (the Hobby plan caps a project at 2 cron jobs).
  let seed = null;
  if (!rateLimited && !invalidToken) {
    seed = await enrichSeedAccounts(admin, limiter, caller, { batch: SEED_BATCH });
    rateLimited = rateLimited || !!seed.rateLimited;
    invalidToken = invalidToken || !!seed.invalidToken;
  }

  // Revive anything that got stranded in `failed`, so no tracked account can go
  // permanently stale without the user ever being told.
  let requeued = 0;
  try {
    requeued = await requeueStrandedRefreshJobs(admin, worthRequeueing);
  } catch (err) {
    console.warn(
      "[refresh-snapshots] requeue stranded jobs failed:",
      err instanceof Error ? err.message : err
    );
  }

  return NextResponse.json({
    ok: true,
    candidates: stale.length,
    processed,
    refreshed,
    requeued: requeued || undefined,
    seed: seed ?? undefined,
    rateLimited: rateLimited || undefined,
    invalidToken: invalidToken || undefined,
  });
}
