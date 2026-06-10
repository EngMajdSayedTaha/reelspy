import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createMetaRateLimiter, SYSTEM_USER_ID } from "@/lib/instagram/rate-limit";
import { refreshAccountSnapshot, pickHealthyToken } from "@/lib/instagram/snapshots";

// Scheduled worker: keeps the GLOBAL snapshot cache warm so on-demand sync is
// (almost) always a cheap DB read. It fetches the UNIQUE set of tracked public
// accounts — once each per run — through the shared MetaRateLimiter, so the
// token bucket and circuit breaker govern it just like user traffic.
export const runtime = "nodejs";
export const maxDuration = 300;

function numEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const BATCH = numEnv("SNAPSHOT_REFRESH_BATCH", 50);
const TTL_SECONDS = numEnv("SNAPSHOT_TTL_SECONDS", 21600);
const HOURLY_BUDGET = numEnv("META_HOURLY_BUDGET", 160);

// Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is set.
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // refuse to run unguarded
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

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
  const stale = allUsernames
    .filter((u) => {
      const f = freshness.get(u);
      if (!f || !f.at || f.status !== "ok") return true;
      return new Date(f.at).getTime() + TTL_SECONDS * 1000 <= now;
    })
    .sort((a, b) => {
      const ta = freshness.get(a)?.at ? new Date(freshness.get(a)!.at as string).getTime() : 0;
      const tb = freshness.get(b)?.at ? new Date(freshness.get(b)!.at as string).getTime() : 0;
      return ta - tb; // oldest first
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

  return NextResponse.json({
    ok: true,
    candidates: stale.length,
    processed,
    refreshed,
    rateLimited: rateLimited || undefined,
    invalidToken: invalidToken || undefined,
  });
}
