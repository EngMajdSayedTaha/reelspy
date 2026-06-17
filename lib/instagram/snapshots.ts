// Global snapshot cache — the dedup layer that makes Business Discovery scale.
//
// Every public account is fetched from Meta at most once per TTL and stored in
// ig_account_snapshots / ig_reel_snapshots. N users tracking the same account
// then share that single fetch instead of each spending app-level quota. The
// per-user feed (tracked_reels, which also holds favorites/discards/transcripts)
// is "materialized" from the cache with pure DB work — no Graph calls.
//
// All cache IO uses the service-role (admin) client because the tables are
// RLS-locked global state; the actual Graph fetch still flows through the
// shared MetaRateLimiter so the token bucket + circuit breaker govern it.

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAccountReels } from "./graph-api";
import { fetchGridReels, gridScrapeEnabled, extractShortcode } from "./grid-scrape";
import type { MetaRateLimiter } from "./rate-limit";
import { numEnv } from "@/lib/utils/env";

const DEFAULT_TTL_SECONDS = numEnv("SNAPSHOT_TTL_SECONDS", 21600); // 6h
const DEFAULT_MAX_REELS = numEnv("SNAPSHOT_MAX_REELS", 25);

export type SnapshotProfile = {
  display_name: string;
  followers_count: number | null;
  avatar_url: string | null;
};

export type SnapshotResult = {
  status: "ok" | "error" | "rate_limited" | "not_found";
  fetched: boolean; // true if we actually called Meta this time
  // Fresh profile from this fetch — lets the sync route keep the per-user
  // account's avatar/followers/handle current (IG avatar URLs expire).
  profile?: SnapshotProfile;
  rateLimited?: boolean;
  retryAfterSeconds?: number;
  error?: string;
};

function normalize(username: string): string {
  return username.trim().replace(/^@+/, "").toLowerCase();
}

// Refresh one public account's snapshot if it's stale. Deduped across all users.
export async function refreshAccountSnapshot(
  admin: SupabaseClient,
  limiter: MetaRateLimiter,
  callerIgUserId: string,
  callerToken: string,
  username: string,
  opts?: { ttlSeconds?: number; maxReels?: number; force?: boolean }
): Promise<SnapshotResult> {
  const uname = normalize(username);
  const ttlSeconds = opts?.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const maxReels = opts?.maxReels ?? DEFAULT_MAX_REELS;

  // Ensure the account row exists (needed for the reel FK and freshness check).
  await admin
    .from("ig_account_snapshots")
    .upsert({ ig_username: uname }, { onConflict: "ig_username", ignoreDuplicates: true });

  if (!opts?.force) {
    const { data: snap } = await admin
      .from("ig_account_snapshots")
      .select("last_fetched_at, last_status")
      .eq("ig_username", uname)
      .maybeSingle();

    const freshUntil = snap?.last_fetched_at
      ? new Date(snap.last_fetched_at).getTime() + ttlSeconds * 1000
      : 0;

    if (snap?.last_status === "ok" && freshUntil > Date.now()) {
      return { status: "ok", fetched: false };
    }
  }

  const { reels, profile, error, rateLimited, retryAfterSeconds } = await fetchAccountReels(
    callerIgUserId,
    callerToken,
    uname,
    maxReels,
    limiter
  );

  // Normalize the profile for both the snapshot row and the caller. The IG
  // avatar URL is signed + expiring, so we refresh it on every fetch.
  const snapshotProfile: SnapshotProfile | undefined = profile
    ? {
        display_name: profile.username || uname,
        followers_count: profile.followers_count ?? null,
        avatar_url: profile.profile_picture_url ?? null,
      }
    : undefined;

  // Throttled with nothing new — leave the existing cache intact and report it.
  if (rateLimited && reels.length === 0) {
    await admin
      .from("ig_account_snapshots")
      .update({ last_status: "rate_limited", last_error: error ?? "rate limited" })
      .eq("ig_username", uname);
    return { status: "rate_limited", fetched: false, rateLimited: true, retryAfterSeconds, error };
  }

  if (error && reels.length === 0) {
    const notFound = /not found|private|not a business/i.test(error);
    await admin
      .from("ig_account_snapshots")
      .update({ last_status: notFound ? "not_found" : "error", last_error: error })
      .eq("ig_username", uname);
    return { status: notFound ? "not_found" : "error", fetched: false, error };
  }

  const nowIso = new Date().toISOString();
  const rows = reels
    .filter((r) => r.id && r.permalink)
    .map((r) => ({
      ig_username: uname,
      ig_media_id: r.id,
      permalink: r.permalink!,
      caption: r.caption ?? null,
      thumbnail_url: r.thumbnail_url ?? null,
      view_count: r.view_count ?? 0,
      like_count: r.like_count ?? 0,
      comment_count: r.comments_count ?? 0,
      posted_at: r.timestamp ?? null,
      last_seen_at: nowIso,
    }));

  // Supplement with collab reels from the public grid. Business Discovery omits
  // reels this account only co-authored; the grid shows them. Best-effort and
  // additive — any failure leaves the Graph results untouched. We dedup by
  // shortcode (Graph media ids and grid pks differ), so a reel that's in BOTH
  // sources stays under its Graph id and only grid-ONLY (collab) reels get
  // appended, preventing duplicate rows for the same reel.
  if (reels.length > 0 && gridScrapeEnabled()) {
    const graphShortcodes = new Set(
      reels.map((r) => extractShortcode(r.permalink)).filter((s): s is string => Boolean(s))
    );
    const grid = await fetchGridReels(uname, maxReels);
    if (grid.status === "ok") {
      for (const g of grid.reels) {
        if (graphShortcodes.has(g.shortcode)) continue;
        rows.push({
          ig_username: uname,
          ig_media_id: g.mediaId,
          permalink: g.permalink,
          caption: g.caption,
          thumbnail_url: g.thumbnailUrl,
          view_count: g.viewCount,
          like_count: g.likeCount,
          comment_count: g.commentCount,
          posted_at: g.postedAt,
          last_seen_at: nowIso,
        });
      }
    }
  }

  if (rows.length > 0) {
    await admin
      .from("ig_reel_snapshots")
      .upsert(rows, { onConflict: "ig_username,ig_media_id" });
  }

  // Refresh the shared profile alongside reels (avatar URL expires over time).
  // N users tracking this account all read the one cached avatar.
  await admin
    .from("ig_account_snapshots")
    .update({
      last_fetched_at: new Date().toISOString(),
      last_status: "ok",
      last_error: null,
      ...(snapshotProfile
        ? {
            display_name: snapshotProfile.display_name,
            followers_count: snapshotProfile.followers_count,
            avatar_url: snapshotProfile.avatar_url,
          }
        : {}),
    })
    .eq("ig_username", uname);

  return {
    status: "ok",
    fetched: true,
    profile: snapshotProfile,
    rateLimited: rateLimited || undefined,
    retryAfterSeconds,
  };
}

// Copy shared snapshot reels into one user's personal feed. Pure DB work: no
// Graph calls, no rate-limit cost. Inserts new reels and refreshes public
// metrics on existing ones, preserving per-user state (favorites, discards…).
export async function materializeForUser(
  admin: SupabaseClient,
  db: SupabaseClient,
  userId: string,
  accountId: string,
  username: string,
  limit?: number
): Promise<{ inserted: number; updated: number }> {
  const uname = normalize(username);

  let query = admin
    .from("ig_reel_snapshots")
    .select("ig_media_id, permalink, caption, thumbnail_url, view_count, like_count, comment_count, posted_at")
    .eq("ig_username", uname)
    .order("posted_at", { ascending: false, nullsFirst: false });

  if (limit && limit > 0) query = query.limit(limit);

  const { data: snapReels } = await query;
  const rows = snapReels ?? [];
  if (rows.length === 0) return { inserted: 0, updated: 0 };

  const mediaIds = rows.map((r) => r.ig_media_id).filter(Boolean);

  // Dedup is scoped to THIS account, not the whole user. A collab reel is
  // returned by Business Discovery under every account that co-authored it
  // (same ig_media_id). Without the account filter, the reel would land under
  // whichever account synced first and be skipped as "existing" for the others
  // it's shared with — so it would never show under those accounts' feeds.
  const { data: existing } = await db
    .from("tracked_reels")
    .select("ig_media_id")
    .eq("user_id", userId)
    .eq("account_id", accountId)
    .in("ig_media_id", mediaIds);

  const existingIds = new Set((existing ?? []).map((r) => r.ig_media_id));

  const inserts = rows
    .filter((r) => r.ig_media_id && r.permalink && !existingIds.has(r.ig_media_id))
    .map((r) => ({
      user_id: userId,
      account_id: accountId,
      ig_media_id: r.ig_media_id,
      ig_permalink: r.permalink,
      caption: r.caption,
      thumbnail_url: r.thumbnail_url,
      view_count: r.view_count ?? 0,
      like_count: r.like_count ?? 0,
      comment_count: r.comment_count ?? 0,
      posted_at: r.posted_at,
    }));

  let inserted = 0;
  if (inserts.length > 0) {
    const { error } = await db.from("tracked_reels").insert(inserts);
    if (!error) inserted = inserts.length;
  }

  // Metric refreshes are independent per reel — run them concurrently instead
  // of serially (one round-trip each adds up fast across many accounts).
  const updateResults = await Promise.all(
    rows
      .filter((r) => existingIds.has(r.ig_media_id))
      .map((r) =>
        db
          .from("tracked_reels")
          .update({
            view_count: r.view_count ?? 0,
            like_count: r.like_count ?? 0,
            comment_count: r.comment_count ?? 0,
            thumbnail_url: r.thumbnail_url,
          })
          .eq("user_id", userId)
          .eq("account_id", accountId)
          .eq("ig_media_id", r.ig_media_id)
      )
  );
  const updated = updateResults.filter((r) => !r.error).length;

  return { inserted, updated };
}

export type HealthyToken = { userId: string; igUserId: string; token: string };

// Pick any connected creator's healthy token for the background worker. Business
// Discovery can read any public account with any valid token, and the rate limit
// is app-level, so one healthy token is enough; we rotate by least-recently-used
// to surface dead tokens. Returns null when nobody has connected yet.
export async function pickHealthyToken(admin: SupabaseClient): Promise<HealthyToken | null> {
  const nowIso = new Date().toISOString();
  const { data } = await admin
    .from("profiles")
    .select("id, ig_user_id, ig_access_token, ig_token_expires_at, ig_token_status")
    .eq("ig_token_status", "active")
    .not("ig_access_token", "is", null)
    .not("ig_user_id", "is", null)
    .order("ig_token_refreshed_at", { ascending: true, nullsFirst: true })
    .limit(25);

  for (const row of data ?? []) {
    if (row.ig_token_expires_at && new Date(row.ig_token_expires_at).toISOString() <= nowIso) {
      continue;
    }
    if (row.ig_access_token && row.ig_user_id) {
      return { userId: row.id, igUserId: row.ig_user_id, token: row.ig_access_token };
    }
  }

  return null;
}
