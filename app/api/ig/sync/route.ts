import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createMetaRateLimiter } from "@/lib/instagram/rate-limit";
import { refreshAccountSnapshot, materializeForUser } from "@/lib/instagram/snapshots";

// Paced requests + multi-account loops need a generous budget.
export const runtime = "nodejs";
export const maxDuration = 300;

type SyncBody = {
  account_id?: string;
  limit?: number;
};

// How many reels to pull per account. Clamped to a sane range.
const DEFAULT_SYNC_LIMIT = 25;
const MAX_SYNC_LIMIT = 200;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveLimit(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_SYNC_LIMIT;
  return Math.min(MAX_SYNC_LIMIT, Math.max(1, Math.floor(n)));
}

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("ig_access_token, ig_user_id, ig_token_status")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  if (!profile?.ig_access_token || !profile.ig_user_id) {
    return NextResponse.json(
      { error: "Instagram account is not connected. Go to Settings → Instagram to connect." },
      { status: 400 }
    );
  }

  // Token was flagged dead by the refresh worker — tell the user to reconnect
  // instead of letting every sync fail silently.
  if (profile.ig_token_status === "invalid" || profile.ig_token_status === "expired") {
    return NextResponse.json(
      { error: "Your Instagram connection expired. Go to Settings → Instagram to reconnect." },
      { status: 400 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as SyncBody;
  const syncLimit = resolveLimit(body.limit);

  // Build query for inspiration accounts to sync
  let accountsQuery = supabase
    .from("inspiration_accounts")
    .select("id, ig_username")
    .eq("user_id", user.id)
    .eq("is_active", true);

  if (body.account_id) {
    accountsQuery = accountsQuery.eq("id", body.account_id);
  }

  const { data: accounts, error: accountsError } = await accountsQuery;

  if (accountsError) {
    return NextResponse.json({ error: accountsError.message }, { status: 500 });
  }

  if (!accounts || accounts.length === 0) {
    return NextResponse.json({
      inserted: 0,
      skipped: 0,
      errors: body.account_id ? ["Account not found."] : ["No active inspiration accounts. Add some on the Accounts page."],
    });
  }

  // Shared, app-wide guard. Business Discovery is rate-limited per Meta APP
  // (not per user), so this protects every connected account at once.
  const limiter = createMetaRateLimiter(supabase, user.id);
  // Admin client for the global snapshot cache (RLS-locked shared tables).
  const admin = createAdminClient();

  let totalInserted = 0;
  let totalUpdated = 0;
  const errors: string[] = [];

  let rateLimitHit = false;
  let retryAfterSeconds: number | undefined;

  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];

    // Throttle between accounts to stay under Instagram's app-level rate limit.
    // (Only matters when the snapshot is stale and we actually call Meta.)
    if (i > 0) {
      await sleep(300);
    }

    // 1) Refresh the SHARED snapshot if stale — deduped across every user, and
    //    skipped entirely (no Graph call) when the cache is still warm.
    const snap = await refreshAccountSnapshot(
      admin,
      limiter,
      profile.ig_user_id,
      profile.ig_access_token,
      account.ig_username,
      { maxReels: syncLimit }
    );

    if (snap.rateLimited) {
      retryAfterSeconds = snap.retryAfterSeconds ?? retryAfterSeconds;
      rateLimitHit = true;
    }

    if (snap.status === "error" || snap.status === "not_found") {
      if (snap.error) errors.push(`@${account.ig_username}: ${snap.error}`);
    }

    // 2) Materialize from the cache into this user's feed — pure DB, no quota.
    //    Runs even when the refresh was throttled, so users still get cached reels.
    const { inserted, updated } = await materializeForUser(
      admin,
      supabase,
      user.id,
      account.id,
      account.ig_username,
      syncLimit
    );
    totalInserted += inserted;
    totalUpdated += updated;

    await supabase
      .from("inspiration_accounts")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", account.id);

    // Stop early on throttling so we don't worsen the app-level limit.
    if (rateLimitHit) break;
  }

  if (rateLimitHit) {
    const mins = retryAfterSeconds ? Math.max(1, Math.ceil(retryAfterSeconds / 60)) : null;
    errors.push(
      mins
        ? `Instagram's rate limit was reached, so syncing stopped early. Try again in about ${mins} min.`
        : "Instagram's hourly rate limit was reached, so syncing stopped early. Wait about an hour and sync fewer accounts at a time."
    );
  }

  const payload = {
    inserted: totalInserted,
    updated: totalUpdated,
    rateLimited: rateLimitHit || undefined,
    retryAfterSeconds: rateLimitHit ? retryAfterSeconds : undefined,
    errors: errors.length > 0 ? errors : undefined,
  };

  // Surface throttling as 429 + Retry-After so clients (and proxies) can back off
  // properly, but only when nothing synced — partial successes stay 200.
  if (rateLimitHit && totalInserted === 0 && totalUpdated === 0) {
    return NextResponse.json(payload, {
      status: 429,
      headers: retryAfterSeconds ? { "Retry-After": String(Math.ceil(retryAfterSeconds)) } : undefined,
    });
  }

  return NextResponse.json(payload);
}
