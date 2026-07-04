// Client-safe niche types + pure helpers (roadmap X3). No `server-only`, no
// admin client — so client components (NichePicker, TrendReelCard) and the
// server action can import the constants/types without dragging the server-only
// aggregation module (and its DB client) into the browser bundle. The heavy
// cross-user queries live in `./niche` (server-only), which re-exports these.

export const ALL_NICHES = "__all__";

export type NicheSummary = {
  niche: string; // normalized key; also the display label
  accountCount: number; // distinct public accounts filed under it (cross-user)
  taggerCount: number; // distinct users who filed an account under it
};

export type TrendReel = {
  igUsername: string;
  followers: number | null;
  permalink: string | null;
  caption: string | null;
  thumbnailUrl: string | null;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  postedAt: string | null;
  score: number;
  // How hard this reel beats the account's own median in-window (size-control:
  // a small account's true outlier surfaces above a big account's baseline).
  outperformRatio: number;
  // Audience-normalized rank key (score per follower) — never surfaced raw.
  relativeScore: number;
};

// Mirror tracked_reels.viral_score (schema.sql) — the snapshot cache stores the
// raw counts but not the derived score.
export function viralScore(like: number, comment: number, view: number): number {
  return like * 1 + comment * 3 + view * 0.01;
}

// Normalize a group name into a niche key so "Real Estate" and "real estate "
// collapse. Kept loose (lowercase + whitespace collapse) — users' own labels.
export function slugifyNiche(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}
