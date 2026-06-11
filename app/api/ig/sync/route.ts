import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createMetaRateLimiter } from "@/lib/instagram/rate-limit";
import { fetchBusinessDiscovery } from "@/lib/instagram/graph-api";
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
    .select("id, ig_username, last_synced_at, avatar_url, display_name, followers_count")
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

    // 1) Refresh the SHARED snapshot if stale — deduped across every user, and
    //    skipped entirely (no Graph call) when the cache is still warm.
    const snap = await refreshAccountSnapshot(
      admin,
      limiter,
      credentials.igUserId,
      credentials.token,
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

    // 1b) Backfill missing profile data (avatar/followers) — accounts added in
    //     bulk (e.g. the following import) skip Business Discovery validation,
    //     so their first sync enriches them here. Cached in the shared snapshot
    //     row so N users tracking the same account pay for one fetch. Gated on
    //     a healthy snapshot: if Business Discovery can't read the account at
    //     all (private / not Business), retrying the profile fetch every sync
    //     would burn budget forever.
    if (!account.avatar_url && !rateLimitHit && snap.status === "ok") {
      const uname = account.ig_username.toLowerCase();
      const { data: snapProfile } = await admin
        .from("ig_account_snapshots")
        .select("display_name, followers_count, avatar_url")
        .eq("ig_username", uname)
        .maybeSingle();

      let profile: {
        username: string;
        followers_count?: number;
        profile_picture_url?: string;
      } | null = snapProfile?.avatar_url
        ? {
            username: snapProfile.display_name ?? account.ig_username,
            followers_count: snapProfile.followers_count ?? undefined,
            profile_picture_url: snapProfile.avatar_url,
          }
        : null;

      if (!profile) {
        const discovery = await fetchBusinessDiscovery(
          credentials.igUserId,
          credentials.token,
          uname,
          limiter
        );
        if (discovery.rateLimited) rateLimitHit = true;
        profile = discovery.profile;
        if (profile) {
          await admin
            .from("ig_account_snapshots")
            .update({
              display_name: profile.username,
              followers_count: profile.followers_count ?? null,
              avatar_url: profile.profile_picture_url ?? null,
            })
            .eq("ig_username", uname);
        }
      }

      if (profile) {
        await supabase
          .from("inspiration_accounts")
          .update({
            display_name: profile.username,
            followers_count: profile.followers_count ?? null,
            avatar_url: profile.profile_picture_url ?? null,
          })
          .eq("id", account.id);
      }
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
