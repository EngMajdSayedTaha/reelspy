import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createMetaRateLimiter, SYSTEM_USER_ID } from "@/lib/instagram/rate-limit";
import { refreshAccountSnapshot, pickHealthyToken } from "@/lib/instagram/snapshots";
import { cronAuthorized } from "@/lib/utils/cron";
import { numEnv } from "@/lib/utils/env";

// One-off/periodic worker that VALIDATES + ENRICHES the cold-start seed pool
// (seed_accounts). Mirrors refresh-snapshots exactly, but the candidate set comes
// from seed_accounts instead of inspiration_accounts. It reuses the same
// machinery — one shared healthy token, the app-level MetaRateLimiter (token
// bucket + circuit breaker), and refreshAccountSnapshot (writes followers/avatar
// to ig_account_snapshots and reels to ig_reel_snapshots, sets last_status).
//
// Seeds are large (100s per niche) but one-time: run this repeatedly until the
// pool is drained, then the 6h TTL keeps it warm. Handles that come back
// private / not-a-business land as last_status='not_found' and never surface in
// suggestions. Kept separate from refresh-snapshots so seed backfill can't starve
// live user-tracked accounts of the shared Meta budget.
export const runtime = "nodejs";
export const maxDuration = 300;

const BATCH = numEnv("SEED_ENRICH_BATCH", 50);
const TTL_SECONDS = numEnv("SNAPSHOT_TTL_SECONDS", 21600);
const HOURLY_BUDGET = numEnv("META_HOURLY_BUDGET", 160);

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // A single healthy token is enough — Business Discovery reads any public
  // account, and the rate limit is app-level.
  const caller = await pickHealthyToken(admin);
  if (!caller) {
    return NextResponse.json({ ok: true, processed: 0, note: "No connected accounts yet." });
  }

  // All seeded handles across every niche.
  const { data: rows } = await admin.from("seed_accounts").select("ig_username");
  const allUsernames = Array.from(
    new Set((rows ?? []).map((r) => String(r.ig_username).toLowerCase()))
  );

  if (allUsernames.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, note: "No seed accounts." });
  }

  // Prioritize the stalest / never-fetched accounts. Pull current freshness once.
  const { data: snaps } = await admin
    .from("ig_account_snapshots")
    .select("ig_username, last_fetched_at, last_status");

  const freshness = new Map(
    (snaps ?? []).map((s) => [s.ig_username, { at: s.last_fetched_at, status: s.last_status }])
  );

  const now = Date.now();
  // A seeded handle is worth (re)fetching unless it's fresh OR terminally dead.
  // 'not_found' is terminal — the handle isn't a public business/creator account,
  // so retrying it just burns the shared Meta budget on every run forever. Every
  // other non-ok state (pending / error / rate_limited) is transient and retried.
  const isStale = (u: string): boolean => {
    const f = freshness.get(u);
    if (!f) return true; // no snapshot row yet
    if (f.status === "not_found") return false; // terminal — don't retry
    if (f.status !== "ok") return true; // pending / error / rate_limited
    if (!f.at) return true; // ok but never timestamped (shouldn't happen)
    return new Date(f.at).getTime() + TTL_SECONDS * 1000 <= now;
  };

  const stale = allUsernames
    .filter(isStale)
    .sort((a, b) => {
      const ta = freshness.get(a)?.at ? new Date(freshness.get(a)!.at as string).getTime() : 0;
      const tb = freshness.get(b)?.at ? new Date(freshness.get(b)!.at as string).getTime() : 0;
      return ta - tb; // oldest / never-fetched first
    })
    .slice(0, BATCH);

  // System limiter: full app budget as the per-user cap (the worker isn't a real
  // user), but still bounded by the shared token bucket + circuit breaker.
  const limiter = createMetaRateLimiter(admin, SYSTEM_USER_ID, HOURLY_BUDGET);

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

  const remaining = allUsernames.filter(isStale).length - processed;

  return NextResponse.json({
    ok: true,
    seedTotal: allUsernames.length,
    candidates: stale.length,
    processed,
    refreshed,
    remaining: Math.max(0, remaining),
    rateLimited: rateLimited || undefined,
    invalidToken: invalidToken || undefined,
  });
}
