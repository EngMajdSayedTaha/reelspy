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
import type { MetaRateLimiter } from "./rate-limit";
import { createInstagramResearchSource } from "@/lib/research/instagram";
import { numEnv } from "@/lib/utils/env";
import { cacheImage, isSelfHosted } from "./media-cache";

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

// Public alias so callers outside this module (e.g. the sync route enqueuing
// background refresh jobs) key on the exact same normalized username the cache
// and snapshot rows use.
export function normalizeUsername(username: string): string {
  return normalize(username);
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

  // Research platform abstraction (X5/H2): the snapshot layer talks to the
  // source-agnostic ResearchSource contract, not Business Discovery directly.
  // Instagram is the implementation today; a TikTok source slots in behind the
  // same interface once it ships.
  const source = createInstagramResearchSource({
    igUserId: callerIgUserId,
    token: callerToken,
    limiter,
  });
  const { reels, profile, error, rateLimited, retryAfterSeconds } =
    await source.getRecentReels(uname, maxReels);

  // Download a permanent copy of the avatar instead of trusting Instagram's
  // signed URL to stay alive (see media-cache.ts). Cheap — one image per
  // account per fetch — so we just always re-cache to also pick up profile
  // picture changes.
  const cachedAvatarUrl = profile?.avatarUrl
    ? (await cacheImage(admin, profile.avatarUrl, `avatars/${uname}.jpg`)) ?? profile.avatarUrl
    : null;

  // Normalize the profile for both the snapshot row and the caller.
  const snapshotProfile: SnapshotProfile | undefined = profile
    ? {
        display_name: profile.displayName || profile.username || uname,
        followers_count: profile.followersCount ?? null,
        avatar_url: cachedAvatarUrl,
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

  if (reels.length > 0) {
    // Download a permanent copy of each thumbnail (see media-cache.ts). A
    // reel's thumbnail never changes once posted, so skip re-downloading any
    // media_id whose stored URL is already self-hosted — saves bandwidth on
    // every reel that was already cached by a previous fetch.
    const externalIds = reels.map((r) => r.externalId).filter((id): id is string => Boolean(id));
    const { data: existingSnaps } =
      externalIds.length > 0
        ? await admin
            .from("ig_reel_snapshots")
            .select("ig_media_id, thumbnail_url")
            .eq("ig_username", uname)
            .in("ig_media_id", externalIds)
        : { data: [] as { ig_media_id: string; thumbnail_url: string | null }[] };
    const existingThumbs = new Map(
      (existingSnaps ?? []).map((s) => [s.ig_media_id, s.thumbnail_url])
    );

    const cachedThumbnails = new Map<string, string>();
    await Promise.all(
      reels.map(async (r) => {
        if (!r.externalId || !r.thumbnailUrl) return;
        const existing = existingThumbs.get(r.externalId);
        if (isSelfHosted(existing)) {
          cachedThumbnails.set(r.externalId, existing!);
          return;
        }
        const cached = await cacheImage(admin, r.thumbnailUrl, `thumbnails/${r.externalId}.jpg`);
        cachedThumbnails.set(r.externalId, cached ?? r.thumbnailUrl);
      })
    );

    const rows = reels
      .filter((r) => r.externalId && r.permalink)
      .map((r) => ({
        ig_username: uname,
        ig_media_id: r.externalId,
        permalink: r.permalink!,
        caption: r.caption ?? null,
        thumbnail_url: (r.externalId && cachedThumbnails.get(r.externalId)) || r.thumbnailUrl || null,
        view_count: r.viewCount ?? 0,
        like_count: r.likeCount ?? 0,
        comment_count: r.commentCount ?? 0,
        posted_at: r.postedAt ?? null,
        last_seen_at: new Date().toISOString(),
      }));

    if (rows.length > 0) {
      await admin
        .from("ig_reel_snapshots")
        .upsert(rows, { onConflict: "ig_username,ig_media_id" });

      // Push the freshly-fetched (not-yet-expired) thumbnail URLs into every
      // user's copy of these reels, not just whichever user's sync happened
      // to trigger this fetch. Without this, tracked_reels.thumbnail_url only
      // gets refreshed for the triggering user, and Instagram's signed CDN
      // URL expires (~7 days) for everyone else — permanently, since a dead
      // signed URL can't be retried back to life.
      const thumbRows = rows
        .filter((r) => r.thumbnail_url)
        .map((r) => ({ ig_media_id: r.ig_media_id, thumbnail_url: r.thumbnail_url }));
      if (thumbRows.length > 0) {
        const { error: propagateError } = await admin.rpc("bulk_propagate_reel_thumbnails", {
          p_rows: thumbRows,
        });
        if (propagateError) {
          console.warn(
            "[snapshots] bulk_propagate_reel_thumbnails failed:",
            propagateError.message
          );
        }
      }
    }
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

  // Same problem as reel thumbnails, one level up: push the fresh avatar to
  // EVERY user tracking this account, not just the one whose sync (or the
  // daily cron) happened to fetch it.
  if (snapshotProfile?.avatar_url) {
    await admin
      .from("inspiration_accounts")
      .update({ avatar_url: snapshotProfile.avatar_url })
      .eq("ig_username", uname);
  }

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

  // Refresh public metrics on the reels this user already has. One bulk RPC
  // applies the whole batch in a single round-trip (it ran as N concurrent
  // UPDATEs before — one network hop per reel, which adds up across accounts).
  const updates = rows
    .filter((r) => existingIds.has(r.ig_media_id))
    .map((r) => ({
      ig_media_id: r.ig_media_id,
      view_count: r.view_count ?? 0,
      like_count: r.like_count ?? 0,
      comment_count: r.comment_count ?? 0,
      thumbnail_url: r.thumbnail_url,
    }));

  let updated = 0;
  if (updates.length > 0) {
    const { data: bulkCount, error: bulkError } = await db.rpc(
      "bulk_update_tracked_reel_metrics",
      { p_account_id: accountId, p_rows: updates }
    );

    if (bulkError) {
      // Fall back to per-reel updates if the RPC isn't provisioned yet
      // (migration not applied) — never let a sync fail on this optimization.
      console.warn(
        "[snapshots] bulk_update_tracked_reel_metrics failed; falling back:",
        bulkError.message
      );
      const updateResults = await Promise.all(
        updates.map((u) =>
          db
            .from("tracked_reels")
            .update({
              view_count: u.view_count,
              like_count: u.like_count,
              comment_count: u.comment_count,
              thumbnail_url: u.thumbnail_url,
            })
            .eq("user_id", userId)
            .eq("account_id", accountId)
            .eq("ig_media_id", u.ig_media_id)
        )
      );
      updated = updateResults.filter((r) => !r.error).length;
    } else {
      updated = typeof bulkCount === "number" ? bulkCount : updates.length;
    }
  }

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
