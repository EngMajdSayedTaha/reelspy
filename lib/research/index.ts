// Research platform abstraction barrel (roadmap X5 / H2).
// Types are re-exported from ./types (client-safe); the source factories are
// server-only. snapshots.ts consumes the Instagram source through this contract.

import "server-only";
import { createInstagramResearchSource, type InstagramResearchConfig } from "./instagram";
import { createTikTokResearchSource, tiktokResearchEnabled } from "./tiktok";
import type { ResearchPlatform, ResearchSource } from "./types";

export type {
  ResearchPlatform,
  ResearchProfile,
  ResearchReel,
  ResearchReelsResult,
  ResearchProfileResult,
  ResearchSource,
} from "./types";
export { createInstagramResearchSource } from "./instagram";
export { createTikTokResearchSource, tiktokResearchEnabled } from "./tiktok";

// The research platforms that are actually usable right now. Instagram is always
// available (given a connected credential); TikTok only when its flag+creds are
// set (dormant otherwise). Drives any future "which platforms can I research?" UI.
export function availableResearchPlatforms(): ResearchPlatform[] {
  const platforms: ResearchPlatform[] = ["instagram"];
  if (tiktokResearchEnabled()) platforms.push("tiktok");
  return platforms;
}

// Convenience factory. Instagram needs per-caller credentials; TikTok reads its
// own env. Kept so a caller can resolve a source by platform without importing
// each creator.
export function getResearchSource(
  platform: ResearchPlatform,
  igConfig?: InstagramResearchConfig
): ResearchSource {
  if (platform === "tiktok") return createTikTokResearchSource();
  if (!igConfig) throw new Error("Instagram research source requires caller credentials.");
  return createInstagramResearchSource(igConfig);
}
