// Instagram research source (roadmap X5 / H2). Implements ResearchSource over
// the existing Business Discovery code (graph-api.ts) — no behavior change, just
// the current logic behind the platform-agnostic interface. The caller's IG
// credential + the shared Meta rate limiter are held on the source instance, so
// the interface methods stay platform-neutral (username, maxReels).

import "server-only";
import {
  fetchAccountReels,
  fetchBusinessDiscovery,
  type BusinessDiscoveryProfile,
  type InstagramMedia,
} from "@/lib/instagram/graph-api";
import type { MetaRateLimiter } from "@/lib/instagram/rate-limit";
import type {
  ResearchProfile,
  ResearchProfileResult,
  ResearchReel,
  ResearchReelsResult,
  ResearchSource,
} from "./types";

export type InstagramResearchConfig = {
  igUserId: string;
  token: string;
  limiter?: MetaRateLimiter;
};

// Pure mappers (exported for tests) — Business Discovery shapes → normalized.
export function mapIgProfile(
  p: BusinessDiscoveryProfile,
  fallbackUsername: string
): ResearchProfile {
  return {
    username: p.username || fallbackUsername,
    displayName: p.username || fallbackUsername,
    followersCount: p.followers_count ?? null,
    avatarUrl: p.profile_picture_url ?? null,
  };
}

// Rejects only what is definitely NOT a video, rather than demanding an
// explicit "VIDEO". Two reasons: mapMediaItem already defaults an absent
// media_type to VIDEO and isReel has filtered non-reels out before anything
// reaches here, so requiring the literal would only ever fire on a shape that
// does not occur; and the failure modes are lopsided. Being too strict drops a
// real reel's video silently — the wall shows a still and nothing says why.
// Being too lenient hands a JPEG's URL to the mirror, which checks the response
// content-type and refuses to store it (media-cache), so it costs one HEAD-ish
// fetch and self-corrects.
function isVideoMedia(m: InstagramMedia): boolean {
  const type = String(m.media_type ?? "").toUpperCase();
  return type !== "IMAGE" && type !== "CAROUSEL_ALBUM";
}

export function mapIgReel(m: InstagramMedia): ResearchReel {
  return {
    externalId: m.id,
    permalink: m.permalink ?? null,
    caption: m.caption ?? null,
    thumbnailUrl: m.thumbnail_url ?? null,
    // `media_url` was already in every field list we send; it was just never
    // read. For a VIDEO it is the mp4, which is what the marketing wall plays.
    // Guard on media_type: on an IMAGE or CAROUSEL_ALBUM the same field is a
    // JPEG, and handing that to a <video> element yields a permanently broken
    // one rather than a still.
    videoUrl: isVideoMedia(m) ? (m.media_url ?? null) : null,
    viewCount: m.view_count ?? null,
    likeCount: m.like_count ?? null,
    commentCount: m.comments_count ?? null,
    postedAt: m.timestamp ?? null,
  };
}

export function createInstagramResearchSource(cfg: InstagramResearchConfig): ResearchSource {
  return {
    platform: "instagram",
    isConfigured: () => Boolean(cfg.igUserId && cfg.token),

    async getRecentReels(username: string, maxReels: number): Promise<ResearchReelsResult> {
      const r = await fetchAccountReels(cfg.igUserId, cfg.token, username, maxReels, cfg.limiter);
      return {
        profile: r.profile ? mapIgProfile(r.profile, username) : undefined,
        reels: r.reels.map(mapIgReel),
        error: r.error,
        rateLimited: r.rateLimited,
        retryAfterSeconds: r.retryAfterSeconds,
      };
    },

    async getProfile(username: string): Promise<ResearchProfileResult> {
      const r = await fetchBusinessDiscovery(cfg.igUserId, cfg.token, username, cfg.limiter);
      return {
        profile: r.profile ? mapIgProfile(r.profile, username) : null,
        error: r.error,
        rateLimited: r.rateLimited,
      };
    },
  };
}
