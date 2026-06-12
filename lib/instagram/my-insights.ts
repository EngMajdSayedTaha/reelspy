// Own-account insights: one cached payload per user (profile + media history +
// per-media insights), refreshed from Meta at most once per TTL.
//
// Page loads read the cache (single Postgres query, instant). A stale cache is
// served as-is and revalidated in the background; only a first-ever load or an
// explicit "Sync" pays the live Graph round-trips — and those are batched, so
// the whole sync is 2-3 HTTP calls instead of ~30 sequential ones.
//
// All IO uses the service-role (admin) client: the table is RLS-locked because
// the payload is assembled from token-authenticated Graph reads.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getMediaInsightsBatch,
  getMyInsights,
  getMyMediaPaged,
  type MediaInsights,
  type MyMediaItem,
} from "./graph-api";
import type { IgCredentials } from "./token-store";
import { numEnv } from "@/lib/utils/env";

const MAX_MEDIA = 60;
const MAX_INSIGHTS = 30;
// How long a synced payload is considered fresh. Insights move slowly enough
// that 15 minutes is plenty; "Sync my reels" bypasses it.
const CACHE_TTL_SECONDS = numEnv("MY_INSIGHTS_TTL_SECONDS", 900);
// Background-revalidation lease: a second request within this window won't
// kick off a duplicate sync.
const REFRESH_LEASE_SECONDS = 120;

export type MyInsightsProfile = {
  username: string;
  followers_count: number;
  media_count: number;
  biography: string;
  profile_picture_url: string | null;
};

export type MyInsightsTotals = {
  analyzed: number;
  views: number;
  reach: number;
  likes: number;
  comments: number;
  saved: number;
  shares: number;
};

export type MyInsightsPayload = {
  profile: MyInsightsProfile;
  media: Array<MyMediaItem & { insights: MediaInsights | null }>;
  totals: MyInsightsTotals;
  partial?: boolean;
};

export type CachedMyInsights = {
  payload: MyInsightsPayload;
  fetchedAt: string;
  fresh: boolean;
};

export async function readMyInsightsCache(
  admin: SupabaseClient,
  userId: string
): Promise<CachedMyInsights | null> {
  const { data } = await admin
    .from("ig_my_insights_cache")
    .select("payload, fetched_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data?.payload || !data.fetched_at) return null;

  const ageMs = Date.now() - new Date(data.fetched_at).getTime();
  return {
    payload: data.payload as MyInsightsPayload,
    fetchedAt: data.fetched_at,
    fresh: ageMs < CACHE_TTL_SECONDS * 1000,
  };
}

function isReelItem(item: MyMediaItem): boolean {
  return (
    String(item.media_product_type ?? "").toUpperCase() === "REELS" ||
    String(item.media_type ?? "").toUpperCase() === "VIDEO"
  );
}

// Full live sync: profile + media + batched per-media insights, written back to
// the cache. Throws on profile/media failure (the caller maps rate-limit vs.
// token errors); insights failures degrade per-item instead of failing the sync.
export async function syncMyInsights(
  admin: SupabaseClient,
  userId: string,
  credentials: IgCredentials
): Promise<MyInsightsPayload> {
  const [profile, media] = await Promise.all([
    getMyInsights(credentials.igUserId, credentials.token),
    getMyMediaPaged(credentials.igUserId, credentials.token, MAX_MEDIA),
  ]);

  const targets = media
    .slice(0, MAX_INSIGHTS)
    .map((item) => ({ id: item.id, isReel: isReelItem(item) }));
  const { insights, rateLimited } = await getMediaInsightsBatch(targets, credentials.token);

  const enriched = media.map((item) => ({
    ...item,
    insights: insights.get(item.id) ?? null,
  }));

  const totals = enriched.reduce<MyInsightsTotals>(
    (acc, item) => {
      const ins = item.insights;
      if (!ins) return acc;
      acc.analyzed += 1;
      acc.views += ins.views ?? 0;
      acc.reach += ins.reach ?? 0;
      acc.likes += ins.likes ?? item.like_count ?? 0;
      acc.comments += ins.comments ?? item.comments_count ?? 0;
      acc.saved += ins.saved ?? 0;
      acc.shares += ins.shares ?? 0;
      return acc;
    },
    { analyzed: 0, views: 0, reach: 0, likes: 0, comments: 0, saved: 0, shares: 0 }
  );

  const payload: MyInsightsPayload = {
    profile: {
      username: profile.username,
      followers_count: profile.followers_count,
      media_count: profile.media_count,
      biography: profile.biography,
      profile_picture_url: profile.profile_picture_url,
    },
    media: enriched,
    totals,
    partial: rateLimited || undefined,
  };

  await admin.from("ig_my_insights_cache").upsert(
    {
      user_id: userId,
      payload,
      fetched_at: new Date().toISOString(),
      refresh_started_at: null,
    },
    { onConflict: "user_id" }
  );

  return payload;
}

// Background revalidation entry point: claims the per-user lease first so
// overlapping requests (or a slow previous revalidation) don't double-fetch.
export async function revalidateMyInsights(
  admin: SupabaseClient,
  userId: string,
  credentials: IgCredentials
): Promise<void> {
  const cutoff = new Date(Date.now() - REFRESH_LEASE_SECONDS * 1000).toISOString();
  const { data: claimed } = await admin
    .from("ig_my_insights_cache")
    .update({ refresh_started_at: new Date().toISOString() })
    .eq("user_id", userId)
    .or(`refresh_started_at.is.null,refresh_started_at.lt.${cutoff}`)
    .select("user_id");

  if (!claimed || claimed.length === 0) return;

  await syncMyInsights(admin, userId, credentials);
}
