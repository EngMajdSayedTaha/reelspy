import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  SHOWCASE_NICHES,
  SHOWCASE_LIMIT,
  isShowcaseNiche,
  toPublicReels,
} from "@/lib/trends/public-showcase";
import type { TrendReel } from "@/lib/trends/shared";

const SELF_HOSTED = "https://xyz.supabase.co/storage/v1/object/public/ig-media/r/abc.jpg";
const IG_CDN = "https://scontent.cdninstagram.com/v/t51.29350-15/abc.jpg?_nc_ht=x&oe=6890AB";

function reel(over: Partial<TrendReel> = {}): TrendReel {
  return {
    igUsername: "creator",
    followers: 120_000,
    permalink: "https://www.instagram.com/reel/ABC/",
    caption: "A caption",
    thumbnailUrl: SELF_HOSTED,
    viewCount: 900_000,
    likeCount: 40_000,
    commentCount: 1_200,
    postedAt: "2026-07-01T00:00:00.000Z",
    score: 52_600,
    outperformRatio: 2.34567,
    relativeScore: 0.438,
    ...over,
  };
}

describe("showcase niche allowlist", () => {
  it("accepts allowlisted niches and rejects everything else", () => {
    expect(isShowcaseNiche("fitness")).toBe(true);
    expect(isShowcaseNiche("real estate")).toBe(true);
    expect(isShowcaseNiche("__all__")).toBe(false);
    expect(isShowcaseNiche("cybersecurity")).toBe(false); // a real seed niche, but not public
    expect(isShowcaseNiche("'; drop table --")).toBe(false);
  });

  // The endpoint can only return rows for niches that actually have seed
  // handles behind them; a typo here would ship a permanently empty tab.
  it("every showcase niche exists in the seed data", () => {
    const seedPath = resolve(__dirname, "../../scripts/seed-data/seed-accounts.json");
    const seed = JSON.parse(readFileSync(seedPath, "utf8")) as Record<string, unknown>;
    for (const niche of SHOWCASE_NICHES) {
      expect(Array.isArray(seed[niche]), `missing seed niche: ${niche}`).toBe(true);
      expect((seed[niche] as unknown[]).length).toBeGreaterThan(0);
    }
  });
});

describe("toPublicReels", () => {
  it("never leaks internal ranking fields", () => {
    const [out] = toPublicReels([reel()]);
    expect(out).not.toHaveProperty("score");
    expect(out).not.toHaveProperty("relativeScore");
    expect(Object.keys(out).sort()).toEqual(
      [
        "caption",
        "commentCount",
        "followers",
        "igUsername",
        "likeCount",
        "outperformRatio",
        "permalink",
        "postedAt",
        "thumbnailUrl",
        "viewCount",
      ].sort()
    );
  });

  // Signed IG CDN URLs expire in ~7 days. A page cached for a day and crawled
  // for months would rot into broken images, so only our own bucket ships.
  it("drops thumbnails that aren't self-hosted", () => {
    expect(toPublicReels([reel({ thumbnailUrl: SELF_HOSTED })])[0].thumbnailUrl).toBe(SELF_HOSTED);
    expect(toPublicReels([reel({ thumbnailUrl: IG_CDN })])[0].thumbnailUrl).toBeNull();
    expect(toPublicReels([reel({ thumbnailUrl: null })])[0].thumbnailUrl).toBeNull();
  });

  it("drops reels with no permalink", () => {
    expect(toPublicReels([reel({ permalink: null }), reel()])).toHaveLength(1);
  });

  it("enforces the limit", () => {
    const many = Array.from({ length: 30 }, (_, i) => reel({ igUsername: `c${i}` }));
    expect(toPublicReels(many)).toHaveLength(SHOWCASE_LIMIT);
    expect(toPublicReels(many, 3)).toHaveLength(3);
  });

  it("truncates and normalizes captions", () => {
    const long = toPublicReels([reel({ caption: "x".repeat(400) })])[0].caption!;
    expect(long.length).toBeLessThanOrEqual(140);
    expect(long.endsWith("…")).toBe(true);

    expect(toPublicReels([reel({ caption: "  multi\n\nline   text " })])[0].caption).toBe(
      "multi line text"
    );
    expect(toPublicReels([reel({ caption: "   " })])[0].caption).toBeNull();
    expect(toPublicReels([reel({ caption: null })])[0].caption).toBeNull();
  });

  it("rounds outperformRatio to two decimals", () => {
    expect(toPublicReels([reel({ outperformRatio: 2.34567 })])[0].outperformRatio).toBe(2.35);
  });
});
