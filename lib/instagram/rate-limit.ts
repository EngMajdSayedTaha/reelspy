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

function numEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Effective app-wide hourly budget. Kept under Meta's 200/hour floor so a burst
// never reaches the real ceiling. Override per-deploy via env.
const HOURLY_BUDGET = numEnv("META_HOURLY_BUDGET", 160);
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

export type RateLimitReason = "circuit_open" | "user_quota" | "app_budget" | "rate_limited";

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
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly userId: string
  ) {}

  // Pre-flight gate. Throws MetaRateLimitError when a call must be deferred.
  async acquire(cost = 1): Promise<void> {
    const { data, error } = await this.supabase.rpc("consume_meta_quota", {
      p_user_id: this.userId,
      p_cost: cost,
      p_capacity: HOURLY_BUDGET,
      p_refill_per_sec: REFILL_PER_SEC,
      p_user_cap: USER_HOURLY_BUDGET,
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

export function createMetaRateLimiter(supabase: SupabaseClient, userId: string): MetaRateLimiter {
  return new MetaRateLimiter(supabase, userId);
}
