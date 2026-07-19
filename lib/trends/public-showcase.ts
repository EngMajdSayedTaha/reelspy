// Shaping layer for the PUBLIC trending showcase (app/api/public/trending).
// Client-safe and dependency-free on purpose: the route handler does the DB
// work, this module decides what may leave the building. Kept separate from
// ./shared so the rules below are unit-testable without a Supabase client.

import { isSelfHosted } from "@/lib/instagram/media-cache";
import type { TrendReel } from "./shared";

// The niches the marketing site is allowed to ask for. A fixed allowlist, not
// listSeedNiches(), because this endpoint is unauthenticated: an open `?niche=`
// would let anyone enumerate the seed taxonomy and fan out arbitrary queries.
// Every slug here must exist in scripts/seed-data/seed-accounts.json (asserted
// in test/trends/public-showcase.test.ts).
export const SHOWCASE_NICHES = [
  "fitness",
  "food",
  "real estate",
  "travel",
  "tech",
  "beauty",
] as const;

export type ShowcaseNiche = (typeof SHOWCASE_NICHES)[number];

// Hard cap per niche. Also bounds the response size, since the landing
// prefetches every niche in one server render.
export const SHOWCASE_LIMIT = 8;

// Captions are user-authored copy on someone else's post — truncate rather
// than republish a wall of text on our marketing page.
const CAPTION_MAX = 140;

// The public shape. Deliberately a SUBSET of TrendReel: `score` and
// `relativeScore` are our internal ranking maths (score-per-follower) and stay
// server-side — publishing them would hand a competitor the ranking model.
export type PublicReel = {
  igUsername: string;
  permalink: string | null;
  caption: string | null;
  thumbnailUrl: string | null;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  postedAt: string | null;
  outperformRatio: number;
  followers: number | null;
};

export type PublicTrendingPayload = {
  niche: string;
  reels: PublicReel[];
  generatedAt: string;
};

export function isShowcaseNiche(value: string): value is ShowcaseNiche {
  return (SHOWCASE_NICHES as readonly string[]).includes(value);
}

function truncate(text: string | null, max: number): string | null {
  if (!text) return null;
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return null;
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

// Maps internal reels to the public shape, dropping anything we can't stand
// behind on a marketing page:
//  - thumbnails that aren't ours (raw IG CDN URLs are signed and expire in
//    ~7 days, so a cached marketing page would rot into broken images — the
//    card renders a graphite placeholder for null instead)
//  - reels with no permalink (nothing to click through to)
export function toPublicReels(reels: TrendReel[], limit = SHOWCASE_LIMIT): PublicReel[] {
  return reels
    .filter((r) => !!r.permalink)
    .slice(0, limit)
    .map((r) => ({
      igUsername: r.igUsername,
      permalink: r.permalink,
      caption: truncate(r.caption, CAPTION_MAX),
      thumbnailUrl: isSelfHosted(r.thumbnailUrl) ? r.thumbnailUrl : null,
      viewCount: r.viewCount,
      likeCount: r.likeCount,
      commentCount: r.commentCount,
      postedAt: r.postedAt,
      outperformRatio: Number(r.outperformRatio.toFixed(2)),
      followers: r.followers,
    }));
}
