// Background refresh of one public account's shared snapshot, for the durable
// queue (Move 3). This is the work a `refresh_snapshot` job performs: fetch the
// account from Meta ONCE through the shared limiter, then materialize the fresh
// cache into every user who tracks it. Producers (bulk "Sync All") enqueue one
// job per stale account, deduped by username, so N users syncing overlapping
// accounts collapse to a single Meta call. The cron worker calls this.
//
// Service-role only — snapshot + tracked_reels IO runs on the admin client.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createMetaRateLimiter,
  readHourlyBudget,
  SYSTEM_USER_ID,
  WORKER_BUDGET_SHARE,
} from "@/lib/instagram/rate-limit";
import {
  normalizeUsername,
  pickHealthyToken,
  refreshAccountSnapshot,
  materializeForUser,
} from "@/lib/instagram/snapshots";
import { numEnv } from "@/lib/utils/env";

const DEFAULT_MAX_REELS = numEnv("SNAPSHOT_MAX_REELS", 25);
// Cap how many trackers we fan out to per run so one very popular account can't
// dominate a worker pass; the rest are picked up on the next sync/materialize.
const FANOUT_LIMIT = numEnv("REFRESH_FANOUT_LIMIT", 500);

export type RefreshOutcome =
  | "refreshed" // fetched fresh + materialized to trackers
  | "no_token" // nobody has a healthy IG connection yet — retry later
  | "throttled" // shared limiter/circuit is closed — reschedule
  | "not_found" // account is private/not a business — terminal
  | "skipped" // nothing to do (no username)
  | "failed"; // fetch error — terminal (backoff handled by the worker for retryables)

// Outcomes the worker should reschedule (transient) vs. treat as terminal.
export const RETRYABLE_REFRESH_OUTCOMES: ReadonlySet<RefreshOutcome> = new Set([
  "throttled",
  "no_token",
]);

export async function runRefreshSnapshot(
  admin: SupabaseClient,
  igUsername: string,
  maxReels: number = DEFAULT_MAX_REELS
): Promise<RefreshOutcome> {
  const uname = normalizeUsername(igUsername ?? "");
  if (!uname) return "skipped";

  const caller = await pickHealthyToken(admin);
  if (!caller) return "no_token";

  // System limiter: not a real user, so no per-user cap applies — but it takes
  // only its share of the app budget, leaving the rest as headroom for people
  // syncing on demand right now (see WORKER_BUDGET_SHARE).
  const budget = await readHourlyBudget(admin);
  const limiter = createMetaRateLimiter(
    admin,
    SYSTEM_USER_ID,
    Math.max(1, Math.floor(budget * WORKER_BUDGET_SHARE))
  );

  const snap = await refreshAccountSnapshot(
    admin,
    limiter,
    caller.igUserId,
    caller.token,
    uname,
    { maxReels, force: true }
  );

  if (snap.rateLimited) return "throttled";
  if (snap.status === "not_found") return "not_found";
  if (snap.status === "error") return "failed";

  // Fan the fresh cache out to every active tracker. Pure DB work (no quota) —
  // this is the dedup payoff: one Meta fetch, N cheap per-user materializations.
  const { data: trackers } = await admin
    .from("inspiration_accounts")
    .select("id, user_id")
    .eq("ig_username", uname)
    .eq("is_active", true)
    .limit(FANOUT_LIMIT);

  const syncedAt = new Date().toISOString();
  for (const t of trackers ?? []) {
    try {
      await materializeForUser(admin, admin, t.user_id, t.id, uname, maxReels);
      // The fetch genuinely succeeded and this tracker now holds the fresh reels,
      // so it's honest to call it synced. The enqueueing route deliberately does
      // NOT stamp queued accounts (see app/api/ig/sync/route.ts) — this is the
      // only place a background refresh earns the timestamp.
      await admin
        .from("inspiration_accounts")
        .update({ last_synced_at: syncedAt })
        .eq("id", t.id);
    } catch (err) {
      // One user's materialize failing must not abort the fan-out for the rest.
      console.warn(
        `[refresh-snapshot-job] materialize failed user=${t.user_id} @${uname}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  return "refreshed";
}
