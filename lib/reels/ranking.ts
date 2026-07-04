// Shared reel-ranking helpers (used by the feed "Rising now" rail and the
// weekly digest cron). Pure functions — no I/O.

// Minimal shape needed to rank by engagement velocity.
export type RankableReel = {
  viral_score: number | null;
  posted_at: string | null;
};

export const RISING_WINDOW_DAYS = 30;

export function risingSinceIso(windowDays = RISING_WINDOW_DAYS): string {
  return new Date(Date.now() - windowDays * 24 * 3_600_000).toISOString();
}

// Ranks reels by engagement velocity (viral_score per hour since posting), so a
// fresh reel taking off outranks an older, already-viral one. Generic over any
// row carrying viral_score + posted_at.
export function rankRising<T extends RankableReel>(candidates: T[], limit: number): T[] {
  const now = Date.now();
  return candidates
    .map((reel) => {
      const posted = reel.posted_at ? new Date(reel.posted_at).getTime() : now;
      const ageHours = Math.max(0, (now - posted) / 3_600_000);
      const velocity = (reel.viral_score ?? 0) / (ageHours + 2);
      return { reel, velocity };
    })
    .filter((entry) => entry.velocity > 0)
    .sort((a, b) => b.velocity - a.velocity)
    .slice(0, limit)
    .map((entry) => entry.reel);
}
