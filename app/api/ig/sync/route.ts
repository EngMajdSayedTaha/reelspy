import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createMetaRateLimiter } from "@/lib/instagram/rate-limit";
import { refreshAccountSnapshot, materializeForUser } from "@/lib/instagram/snapshots";
import { getIgCredentials } from "@/lib/instagram/token-store";
import { numEnv } from "@/lib/utils/env";

// Paced requests + multi-account loops need a generous budget.
export const runtime = "nodejs";
export const maxDuration = 300;

type SyncBody = {
  account_id?: string;
  limit?: number;
  force?: boolean;
};

// How many reels to pull per account. Clamped to a sane range.
const DEFAULT_SYNC_LIMIT = 25;
const MAX_SYNC_LIMIT = 200;

// "Sync All" skips accounts synced more recently than this — an account you
// just synced individually has nothing new, so re-syncing it is double work.
const SKIP_FRESH_SECONDS = numEnv("SYNC_SKIP_FRESH_SECONDS", 1800);

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

  // Admin client: global snapshot cache, the shared rate limiter, and the IG
  // token (browser-facing roles can't read the token column).
  const admin = createAdminClient();

  let credentials;
  try {
    credentials = await getIgCredentials(admin, user.id);
  } catch (credError) {
    console.error("Failed to load IG credentials", credError);
    return NextResponse.json({ error: "Could not load your Instagram connection." }, { status: 500 });
  }

  if (!credentials) {
    return NextResponse.json(
      { error: "Instagram account is not connected. Go to Settings → Instagram to connect." },
      { status: 400 }
    );
  }

  // Token was flagged dead by the refresh worker — tell the user to reconnect
  // instead of letting every sync fail silently.
  if (credentials.status === "invalid" || credentials.status === "expired") {
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
    .select("id, ig_username, last_synced_at, avatar_url, display_name, followers_count, linked_usernames")
    .eq("user_id", user.id)
    .eq("is_active", true);

  if (body.account_id) {
    accountsQuery = accountsQuery.eq("id", body.account_id);
  }

  const { data: allAccounts, error: accountsError } = await accountsQuery;

  if (accountsError) {
    return NextResponse.json({ error: accountsError.message }, { status: 500 });
  }

  if (!allAccounts || allAccounts.length === 0) {
    return NextResponse.json({
      inserted: 0,
      updated: 0,
      skippedFresh: 0,
      errors: body.account_id ? ["Account not found."] : ["No active inspiration accounts. Add some on the Accounts page."],
    });
  }

  // No double work: a bulk "Sync All" skips accounts that were synced moments
  // ago (e.g. individually from their card). Explicit single-account syncs and
  // `force` always run.
  const skipBefore = Date.now() - SKIP_FRESH_SECONDS * 1000;
  const isBulk = !body.account_id && !body.force;
  const accounts = isBulk
    ? allAccounts.filter(
        (a) => !a.last_synced_at || new Date(a.last_synced_at).getTime() < skipBefore
      )
    : allAccounts;
  const skippedFresh = allAccounts.length - accounts.length;

  if (accounts.length === 0) {
    return NextResponse.json({
      inserted: 0,
      updated: 0,
      skippedFresh,
      message: "Everything is already up to date — nothing to sync.",
    });
  }

  // Shared, app-wide guard. Business Discovery is rate-limited per Meta APP
  // (not per user), so this protects every connected account at once. Runs on
  // the admin client — the limiter RPCs are revoked for browser-facing roles.
  const limiter = createMetaRateLimiter(admin, user.id);

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

    // 1) Refresh the SHARED snapshot. Manual syncs always force a fresh Meta
    //    call so the user gets up-to-date reels regardless of cache age; the
    //    MetaRateLimiter still guards against API overuse.
    const snap = await refreshAccountSnapshot(
      admin,
      limiter,
      credentials.igUserId,
      credentials.token,
      account.ig_username,
      { maxReels: syncLimit, force: true }
    );

    if (snap.rateLimited) {
      retryAfterSeconds = snap.retryAfterSeconds ?? retryAfterSeconds;
      rateLimitHit = true;
    }

    if (snap.status === "error" || snap.status === "not_found") {
      if (snap.error) errors.push(`@${account.ig_username}: ${snap.error}`);
    }

    // 1b) Refresh this user's account row from the freshly-fetched profile
    //     (avatar/followers/handle). The profile rides along with the reels in
    //     the same Business Discovery call — no extra quota — and the snapshot
    //     layer already cached it for every other user. Crucially this runs on
    //     EVERY sync, not just when the avatar is missing: IG's profile_picture
    //     URLs are signed and expire, so a once-only backfill leaves avatars
    //     broken forever once that URL lapses.
    if (snap.profile) {
      await supabase
        .from("inspiration_accounts")
        .update({
          display_name: snap.profile.display_name,
          followers_count: snap.profile.followers_count,
          avatar_url: snap.profile.avatar_url,
        })
        .eq("id", account.id);
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

    // 2b) Merge in any LINKED partner handles. Instagram's Business Discovery
    //     only returns reels PUBLISHED by the account you query, so a collab reel
    //     a tracked account merely co-authored (but a partner handle published)
    //     never shows under the tracked account. We fetch each partner directly
    //     and materialize its reels into THIS account's feed so they stop going
    //     missing. Each is another Graph call, so we pace and bail on throttling.
    const linked = Array.isArray(account.linked_usernames)
      ? (account.linked_usernames as string[])
      : [];
    for (const linkedUsername of linked) {
      if (rateLimitHit) break;
      const partner = linkedUsername?.trim().toLowerCase();
      if (!partner || partner === account.ig_username) continue;

      await sleep(300);

      const partnerSnap = await refreshAccountSnapshot(
        admin,
        limiter,
        credentials.igUserId,
        credentials.token,
        partner,
        { maxReels: syncLimit, force: true }
      );

      if (partnerSnap.rateLimited) {
        retryAfterSeconds = partnerSnap.retryAfterSeconds ?? retryAfterSeconds;
        rateLimitHit = true;
      }
      if (partnerSnap.status === "error" || partnerSnap.status === "not_found") {
        if (partnerSnap.error) errors.push(`@${partner}: ${partnerSnap.error}`);
      }

      // Partner reels land under THIS account's id, so they show in the same
      // feed card. materializeForUser dedups per (account, media id), so a true
      // collab present under both handles is inserted once, not duplicated.
      const partnerResult = await materializeForUser(
        admin,
        supabase,
        user.id,
        account.id,
        partner,
        syncLimit
      );
      totalInserted += partnerResult.inserted;
      totalUpdated += partnerResult.updated;
    }

    // Don't stamp a throttled refresh as "synced" — the bulk-sync freshness
    // skip would then wrongly pass over this account on the next attempt.
    if (!snap.rateLimited) {
      await supabase
        .from("inspiration_accounts")
        .update({ last_synced_at: new Date().toISOString() })
        .eq("id", account.id);
    }

    // Stop early on throttling so we don't worsen the app-level limit.
    if (rateLimitHit) break;
  }

  // Human-readable retry window for the rate-limit message.
  function formatRetry(seconds?: number): string {
    if (!seconds || seconds <= 0) return "about an hour";
    const mins = Math.ceil(seconds / 60);
    if (mins < 60) return `about ${mins} min`;
    const hrs = Math.round(mins / 60);
    return `about ${hrs} hr${hrs > 1 ? "s" : ""}`;
  }

  let rateLimitMessage: string | undefined;
  if (rateLimitHit) {
    rateLimitMessage = `Instagram's hourly request limit was reached, so the sync paused. Try again in ${formatRetry(
      retryAfterSeconds
    )}.`;
    errors.push(rateLimitMessage);
  }

  const payload = {
    inserted: totalInserted,
    updated: totalUpdated,
    skippedFresh: skippedFresh || undefined,
    rateLimited: rateLimitHit || undefined,
    retryAfterSeconds: rateLimitHit ? retryAfterSeconds : undefined,
    // `error` is what the client surfaces as the primary message.
    error: rateLimitHit && totalInserted === 0 && totalUpdated === 0 ? rateLimitMessage : undefined,
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
