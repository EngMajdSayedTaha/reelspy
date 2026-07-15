// Cold-start seed-pool enrichment. Validates + enriches the curated seed_accounts
// handles through Meta Business Discovery, reusing the shared snapshot cache and
// the app-level MetaRateLimiter (token bucket + circuit breaker). Shared by the
// admin-triggered /api/cron/enrich-seeds route and the daily refresh-snapshots
// cron (which drains a batch after refreshing live tracked accounts).
//
// 'not_found' is TERMINAL: a handle that isn't a public business/creator account
// is skipped forever so it never re-spends the shared Meta budget on every run.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MetaRateLimiter } from "./rate-limit";
import { refreshAccountSnapshot, type HealthyToken } from "./snapshots";
import { numEnv } from "@/lib/utils/env";

const DEFAULT_TTL_SECONDS = numEnv("SNAPSHOT_TTL_SECONDS", 21600); // 6h

export type SeedEnrichStats = {
  seedTotal: number;
  candidates: number;
  processed: number;
  refreshed: number;
  remaining: number;
  rateLimited?: boolean;
  invalidToken?: boolean;
};

export async function enrichSeedAccounts(
  admin: SupabaseClient,
  limiter: MetaRateLimiter,
  caller: HealthyToken,
  opts: { batch: number; ttlSeconds?: number }
): Promise<SeedEnrichStats> {
  const ttlSeconds = opts.ttlSeconds ?? DEFAULT_TTL_SECONDS;

  const { data: rows } = await admin.from("seed_accounts").select("ig_username, niche_slug");
  const nicheByUsername = new Map<string, string>();
  for (const r of rows ?? []) {
    nicheByUsername.set(String(r.ig_username).toLowerCase(), String(r.niche_slug));
  }
  const allUsernames = Array.from(nicheByUsername.keys());
  if (allUsernames.length === 0) {
    return { seedTotal: 0, candidates: 0, processed: 0, refreshed: 0, remaining: 0 };
  }

  // Spend the limited Meta budget where it matters: seed accounts whose niche a
  // real user has actually set get enriched first, so a fresh user's own niche
  // populates on the first run instead of after draining all 2k+ seeds.
  const { data: profileRows } = await admin
    .from("profiles")
    .select("niche_slug")
    .not("niche_slug", "is", null);
  const activeNiches = new Set(
    (profileRows ?? []).map((p) => String(p.niche_slug).toLowerCase())
  );
  const isActive = (u: string): boolean =>
    activeNiches.has((nicheByUsername.get(u) ?? "").toLowerCase());

  const { data: snaps } = await admin
    .from("ig_account_snapshots")
    .select("ig_username, last_fetched_at, last_status");
  const freshness = new Map(
    (snaps ?? []).map((s) => [s.ig_username, { at: s.last_fetched_at, status: s.last_status }])
  );

  const now = Date.now();
  // Worth (re)fetching unless it's fresh OR terminally dead. 'not_found' is
  // terminal; every other non-ok state (pending / error / rate_limited) retries.
  const isStale = (u: string): boolean => {
    const f = freshness.get(u);
    if (!f) return true;
    if (f.status === "not_found") return false;
    if (f.status !== "ok") return true;
    if (!f.at) return true;
    return new Date(f.at).getTime() + ttlSeconds * 1000 <= now;
  };

  const staleAll = allUsernames.filter(isStale);
  const stale = [...staleAll]
    .sort((a, b) => {
      // Active-niche accounts (a real user set that niche) come first.
      const aActive = isActive(a) ? 0 : 1;
      const bActive = isActive(b) ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      const ta = freshness.get(a)?.at ? new Date(freshness.get(a)!.at as string).getTime() : 0;
      const tb = freshness.get(b)?.at ? new Date(freshness.get(b)!.at as string).getTime() : 0;
      return ta - tb; // then oldest / never-fetched first
    })
    .slice(0, opts.batch);

  let processed = 0;
  let refreshed = 0;
  let rateLimited = false;
  let invalidToken = false;

  for (const username of stale) {
    const result = await refreshAccountSnapshot(
      admin,
      limiter,
      caller.igUserId,
      caller.token,
      username
    );
    processed += 1;
    if (result.fetched) refreshed += 1;

    if (result.rateLimited) {
      rateLimited = true;
      break; // circuit is (about to be) open — stop hammering
    }

    if (result.status === "error" && /access token|session|#190/i.test(result.error ?? "")) {
      await admin.from("profiles").update({ ig_token_status: "invalid" }).eq("id", caller.userId);
      invalidToken = true;
      break;
    }
  }

  return {
    seedTotal: allUsernames.length,
    candidates: stale.length,
    processed,
    refreshed,
    remaining: Math.max(0, staleAll.length - processed),
    rateLimited: rateLimited || undefined,
    invalidToken: invalidToken || undefined,
  };
}
