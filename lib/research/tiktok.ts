// TikTok research source (roadmap X5 / H2) — DORMANT scaffolding. It exists to
// prove the ResearchSource abstraction is genuinely pluggable by a second
// platform, mirroring the dormant TikTok *publishing* adapter (frozen pre-audit,
// see 07-future-roadmap). It is NOT wired into snapshots yet and stays disabled
// until:
//   1. TikTok research API access is approved (external), and
//   2. `TIKTOK_RESEARCH_ENABLED=true` + credentials are set, and
//   3. the snapshot schema gains a `platform` discriminator — which per the H2
//      non-negotiable we do NOT add until this source ships live.
//
// Until then `isConfigured()` is false and the methods return a clean
// "unavailable" result (never throw), so any future caller degrades gracefully.

import "server-only";
import type {
  ResearchProfileResult,
  ResearchReelsResult,
  ResearchSource,
} from "./types";

const UNAVAILABLE = "TikTok research isn't available yet — it's pending platform approval.";

export function tiktokResearchEnabled(): boolean {
  return (
    process.env.TIKTOK_RESEARCH_ENABLED === "true" &&
    Boolean(process.env.TIKTOK_CLIENT_KEY) &&
    Boolean(process.env.TIKTOK_CLIENT_SECRET)
  );
}

export function createTikTokResearchSource(): ResearchSource {
  return {
    platform: "tiktok",
    isConfigured: () => tiktokResearchEnabled(),

    async getRecentReels(): Promise<ResearchReelsResult> {
      // When the flag flips + the Research API is wired, this will page the
      // TikTok Research API's video list and map results to ResearchReel.
      return { reels: [], error: UNAVAILABLE };
    },

    async getProfile(): Promise<ResearchProfileResult> {
      return { profile: null, error: UNAVAILABLE };
    },
  };
}
