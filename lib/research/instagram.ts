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

export function mapIgReel(m: InstagramMedia): ResearchReel {
  return {
    externalId: m.id,
    permalink: m.permalink ?? null,
    caption: m.caption ?? null,
    thumbnailUrl: m.thumbnail_url ?? null,
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
