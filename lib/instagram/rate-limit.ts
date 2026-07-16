// Shared guard against Meta's APP-LEVEL rate limits.
//
// Business Discovery (reel sync + account validation) is governed by Meta's
// "Platform Rate Limits": 200 × daily-active-users per rolling hour, a single
// pool SHARED by every user connected to this Meta app. So the guard MUST be
// shared and server-side — an in-memory/per-request counter would let each
// serverless invocation start from zero and still blow the app-wide ceiling.
// State therefore lives in Postgres and is mutated through atomic RPCs
// (see supabase/migrations/20260610_meta_rate_limit.sql).
//
// Three defences, cheapest first:
//   1. Token bucket  — keeps app-wide usage under a safe budget (< Meta's 200).
//   2. Per-user cap  — stops one account starving the shared pool.
//   3. Circuit breaker — trips the instant Meta signals throttling (via the
//      X-App-Usage / X-Business-Use-Case-Usage headers or an error code), so we
//      stop hammering a blocked app, which is exactly what extends the block.

import type { SupabaseClient } from "@supabase/supabase-js";
import { numEnv } from "@/lib/utils/env";

// Floor / default app-wide hourly budget, used until the dynamic budget is
// computed and when the userbase is tiny. Override per-deploy via env.
const HOURLY_BUDGET = numEnv("META_HOURLY_BUDGET", 160);
// Meta's Business Discovery ceiling is ~200 calls/hour PER connected user, app
// wide — so our real allowance scales with the userbase. We size the budget as a
// safe fraction of that live ceiling, floored so a tiny userbase still works and
// hard-capped so a bad count can never blast Meta.
const META_CALLS_PER_USER = numEnv("META_CALLS_PER_USER", 200);
const BUDGET_SAFETY_FACTOR = numEnv("META_BUDGET_SAFETY_FACTOR", 0.7);
const MAX_HOURLY_BUDGET = numEnv("META_MAX_HOURLY_BUDGET", 5000);
// Max Business Discovery calls a single user may spend per rolling hour.
const USER_HOURLY_BUDGET = numEnv("META_USER_HOURLY_BUDGET", 80);
// Cooldown when Meta gives no explicit regain time (its app throttle clears on
// the rolling hour).
const THROTTLE_COOLDOWN = numEnv("META_THROTTLE_COOLDOWN_SECONDS", 3600);
// Brief back-off when usage crosses the safety line but isn't a hard block yet.
const SOFT_COOLDOWN = numEnv("META_SOFT_COOLDOWN_SECONDS", 300);
// App-usage % at/above which we proactively back off (Meta hard-throttles at 100).
const SAFE_USAGE_PCT = numEnv("META_SAFE_USAGE_PCT", 90);
const REFILL_PER_SEC = HOURLY_BUDGET / 3600;
// Meta's app-usage % is measured over a rolling hour, but we only refresh our
// stored reading on an actual Business Discovery call. Between calls the real
// usage drains as old calls age out, so the displayed "shared app pool" figure
// decays linearly to 0 over this window from when it was last observed — without
// this it stays frozen at a stale peak until the next fetch happens to update it.
const USAGE_DECAY_SECONDS = numEnv("META_USAGE_DECAY_SECONDS", 3600);

// Age a stored app-usage reading toward 0. `observedAtMs` is 0 when we have no
// timestamp (pre-migration column absent) — in that case we can't decay, so we
// return the raw value rather than guess.
function decayAppUsage(rawPct: number, observedAtMs: number, nowMs: number): number {
  if (rawPct <= 0) return 0;
  if (!observedAtMs) return rawPct;
  const ageSeconds = (nowMs - observedAtMs) / 1000;
  if (ageSeconds <= 0) return rawPct;
  const factor = Math.max(0, 1 - ageSeconds / USAGE_DECAY_SECONDS);
  return Math.round(rawPct * factor);
}

export type RateLimitReason = "circuit_open" | "user_quota" | "app_budget" | "rate_limited";

// Fixed quota identity for the background snapshot worker (not a real auth user).
// The FK from meta_api_user_usage to auth.users is dropped so this id can exist.
export const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

function messageFor(reason: string, retryAfterSeconds: number): string {
  const mins = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  switch (reason) {
    case "circuit_open":
      return `Instagram's API is cooling down to avoid a block. Try again in about ${mins} min.`;
    case "user_quota":
      return `You've reached your hourly Instagram sync limit. Try again in about ${mins} min.`;
    case "app_budget":
      return `The app is near Instagram's hourly API limit. Try again in about ${mins} min.`;
    default:
      return `Instagram rate limit reached. Try again in about ${mins} min.`;
  }
}

export class MetaRateLimitError extends Error {
  readonly retryAfterSeconds: number;
  readonly reason: string;

  constructor(reason: string, retryAfterSeconds: number) {
    super(messageFor(reason, retryAfterSeconds));
    this.name = "MetaRateLimitError";
    this.reason = reason;
    this.retryAfterSeconds = Math.max(1, Math.ceil(retryAfterSeconds));
  }
}

export type UsageSnapshot = { appUsagePct: number; regainSeconds: number };

// Parse Meta's real-time usage headers. X-App-Usage carries percentages of the
// app's hourly allowance; X-Business-Use-Case-Usage additionally carries
// estimated_time_to_regain_access (in MINUTES) once a bucket is exhausted.
export function parseUsageHeaders(headers: Headers): UsageSnapshot {
  let appUsagePct = 0;
  let regainSeconds = 0;

  const appRaw = headers.get("x-app-usage");
  if (appRaw) {
    try {
      const u = JSON.parse(appRaw) as Record<string, number>;
      appUsagePct = Math.max(appUsagePct, u.call_count ?? 0, u.total_cputime ?? 0, u.total_time ?? 0);
    } catch {
      // Malformed header — ignore.
    }
  }

  const bucRaw = headers.get("x-business-use-case-usage");
  if (bucRaw) {
    try {
      const obj = JSON.parse(bucRaw) as Record<string, Array<Record<string, number>>>;
      for (const entries of Object.values(obj)) {
        for (const e of entries ?? []) {
          appUsagePct = Math.max(
            appUsagePct,
            e.call_count ?? 0,
            e.total_cputime ?? 0,
            e.total_time ?? 0
          );
          const regainMins = e.estimated_time_to_regain_access ?? 0;
          if (regainMins > 0) regainSeconds = Math.max(regainSeconds, regainMins * 60);
        }
      }
    } catch {
      // Malformed header — ignore.
    }
  }

  return { appUsagePct, regainSeconds };
}

export class MetaRateLimiter {
  // userCap lets the background worker spend up to the full app budget (it's not
  // a real user that should be held to the per-user cap), while still obeying
  // the shared token bucket and circuit breaker.
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly userId: string,
    private readonly userCap: number = USER_HOURLY_BUDGET
  ) {}

  // Pre-flight gate. Throws MetaRateLimitError when a call must be deferred.
  async acquire(cost = 1): Promise<void> {
    const { data, error } = await this.supabase.rpc("consume_meta_quota", {
      p_user_id: this.userId,
      p_cost: cost,
      p_capacity: HOURLY_BUDGET,
      p_refill_per_sec: REFILL_PER_SEC,
      p_user_cap: this.userCap,
    });

    if (error) {
      // Fail open if the limiter isn't provisioned yet (migration not applied):
      // never block syncing on the guard's own infra, but surface the gap.
      console.warn("[meta-rate-limit] consume_meta_quota failed; allowing call:", error.message);
      return;
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (row && row.allowed === false) {
      throw new MetaRateLimitError(
        row.reason ?? "rate_limited",
        row.retry_after_seconds ?? THROTTLE_COOLDOWN
      );
    }
  }

  // Post-flight feedback from Meta's response headers (runs on success AND on
  // error responses, which still carry the usage headers).
  async observe(headers: Headers, status: number): Promise<void> {
    const { appUsagePct, regainSeconds } = parseUsageHeaders(headers);

    const hardThrottled = status === 429 || regainSeconds > 0 || appUsagePct >= 100;
    if (hardThrottled) {
      await this.trip(regainSeconds > 0 ? regainSeconds : THROTTLE_COOLDOWN, appUsagePct);
      return;
    }

    if (appUsagePct >= SAFE_USAGE_PCT) {
      await this.trip(SOFT_COOLDOWN, appUsagePct);
      return;
    }

    if (appUsagePct > 0) {
      const { error } = await this.supabase.rpc("record_meta_usage", {
        p_usage: Math.round(appUsagePct),
      });
      if (error) console.warn("[meta-rate-limit] record_meta_usage failed:", error.message);
    }
  }

  // Called from catch blocks when Meta's error BODY signals throttling (error
  // codes 4/17/32/613) but headers weren't read. Idempotent with observe().
  async recordThrottle(retryAfterSeconds = THROTTLE_COOLDOWN): Promise<void> {
    await this.trip(retryAfterSeconds, 100);
  }

  private async trip(seconds: number, usagePct: number): Promise<void> {
    const { error } = await this.supabase.rpc("trip_meta_circuit", {
      p_seconds: Math.max(1, Math.ceil(seconds)),
      p_usage: Math.round(usagePct),
    });
    if (error) console.warn("[meta-rate-limit] trip_meta_circuit failed:", error.message);
  }
}

export type RateLimitStatus = {
  throttled: boolean; // app-wide circuit breaker is open
  retryAfterSeconds: number; // seconds until the circuit clears (0 if not throttled)
  appUsagePct: number; // last observed worst-case X-App-Usage %
  userUsed: number; // this user's calls in the current rolling hour
  userCap: number; // per-user hourly cap
  userResetSeconds: number; // seconds until the user's hourly window resets
};

// Read-only snapshot of the shared limiter + this user's window, for UI display.
// Uses an admin client because the limiter tables are RLS-locked global state.
export async function readRateLimitStatus(
  admin: SupabaseClient,
  userId: string
): Promise<RateLimitStatus> {
  const now = Date.now();

  const { data: limiter } = await admin
    .from("meta_api_limiter")
    .select("throttled_until, app_usage_pct, app_usage_at")
    .eq("id", 1)
    .maybeSingle();

  const throttledUntil = limiter?.throttled_until
    ? new Date(limiter.throttled_until).getTime()
    : 0;
  const throttled = throttledUntil > now;

  const appUsageObservedAt = limiter?.app_usage_at
    ? new Date(limiter.app_usage_at).getTime()
    : 0;
  const appUsagePct = decayAppUsage(limiter?.app_usage_pct ?? 0, appUsageObservedAt, now);

  const { data: usage } = await admin
    .from("meta_api_user_usage")
    .select("window_start, call_count")
    .eq("user_id", userId)
    .maybeSingle();

  let userUsed = 0;
  let userResetSeconds = 0;
  if (usage?.window_start) {
    const ageSeconds = (now - new Date(usage.window_start).getTime()) / 1000;
    if (ageSeconds < 3600) {
      userUsed = usage.call_count ?? 0;
      userResetSeconds = Math.ceil(3600 - ageSeconds);
    }
  }

  return {
    throttled,
    retryAfterSeconds: throttled ? Math.ceil((throttledUntil - now) / 1000) : 0,
    appUsagePct,
    userUsed,
    userCap: USER_HOURLY_BUDGET,
    userResetSeconds,
  };
}

export function createMetaRateLimiter(
  supabase: SupabaseClient,
  userId: string,
  userCap?: number
): MetaRateLimiter {
  return new MetaRateLimiter(supabase, userId, userCap);
}

// Recompute the app-wide hourly budget from the live connected-user count and
// persist it for the shared limiter (consume_meta_quota reads it in-row, so this
// only needs to run on a cadence — the refresh cron does it). Returns the budget
// so the caller can also use it as its own spend cap. Requires an admin client;
// falls back to the static floor on any error so syncing is never blocked on it.
export async function refreshHourlyBudget(admin: SupabaseClient): Promise<number> {
  let budget = HOURLY_BUDGET;
  try {
    const { count } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("ig_token_status", "active");

    const users = count ?? 0;
    const scaled = Math.floor(META_CALLS_PER_USER * users * BUDGET_SAFETY_FACTOR);
    budget = Math.min(MAX_HOURLY_BUDGET, Math.max(HOURLY_BUDGET, scaled));

    const { error } = await admin.rpc("set_meta_hourly_budget", { p_budget: budget });
    if (error) console.warn("[meta-rate-limit] set_meta_hourly_budget failed:", error.message);
  } catch (err) {
    console.warn(
      "[meta-rate-limit] refreshHourlyBudget failed:",
      err instanceof Error ? err.message : err
    );
  }
  return budget;
}
