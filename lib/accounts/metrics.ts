// Pure rollups for the account dossier at /dashboard/accounts/[id].
//
// No Supabase, no `server-only`, no React — everything here takes plain arrays
// and returns plain objects, so it runs inside the RSC and is directly testable
// under vitest (which is node-only, no DOM).
//
// Two rules the whole file obeys:
//
//  1. **Median, not mean.** One 10M-view outlier makes the mean a lie about a
//     typical post. Where both are useful the gap between them is itself the
//     signal (see `outlierRatio`), so both are returned and the UI leads with
//     the median.
//  2. **No Infinity, no NaN, ever.** A tracked account routinely has reels with
//     `view_count = 0` (old archived media Instagram no longer reports on), so
//     every division is guarded and returns `null` rather than a poisoned
//     number that would render as "Infinity%".

export type ReelPoint = {
  id: string;
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  viral_score: number | string | null;
  posted_at: string | null;
  created_at: string | null;
  caption: string | null;
  thumbnail_url: string | null;
  ig_permalink: string | null;
  transcript_status: string | null;
  is_favorite: boolean | null;
  is_worked_on: boolean | null;
};

const DAY_MS = 86_400_000;

/* ------------------------------------------------------------------ *
 * Statistics primitives
 * ------------------------------------------------------------------ */

function num(value: number | string | null | undefined): number {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Linear-interpolated percentile over an unsorted array. Matches Postgres'
 * `percentile_cont`, so the window-scoped numbers this produces and the
 * full-set numbers the `account_insights` RPC produces agree on the same input.
 */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * Math.min(1, Math.max(0, p));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function median(values: number[]): number | null {
  return percentile(values, 0.5);
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Division that refuses to produce Infinity or NaN. */
export function ratio(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null;
  }
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : null;
}

/* ------------------------------------------------------------------ *
 * Reach, engagement, distribution
 * ------------------------------------------------------------------ */

export type ReachSummary = {
  count: number;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  medianViews: number | null;
  meanViews: number | null;
  p90Views: number | null;
  maxViews: number | null;
  medianLikes: number | null;
  medianComments: number | null;
};

export function reachSummary(reels: ReelPoint[]): ReachSummary {
  const views = reels.map((r) => num(r.view_count));
  const likes = reels.map((r) => num(r.like_count));
  const comments = reels.map((r) => num(r.comment_count));
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

  return {
    count: reels.length,
    totalViews: sum(views),
    totalLikes: sum(likes),
    totalComments: sum(comments),
    medianViews: median(views),
    meanViews: mean(views),
    p90Views: percentile(views, 0.9),
    maxViews: views.length ? Math.max(...views) : null,
    medianLikes: median(likes),
    medianComments: median(comments),
  };
}

export type EngagementSummary = {
  /** (Σlikes + Σcomments) / Σviews × 100 — total-weighted. */
  rateByViews: number | null;
  /** Median of per-post (likes+comments)/views × 100, excluding zero-view posts. */
  medianPostRate: number | null;
  /** avg(likes+comments) / followers × 100 — the number managers benchmark. */
  rateByFollowers: number | null;
  /** median(views) / followers — >1 means posts routinely escape their audience. */
  viewsPerFollower: number | null;
  /** Σcomments / (Σlikes + Σcomments) × 100 — conversation vs passive likes. */
  commentShare: number | null;
};

export function engagementSummary(
  reels: ReelPoint[],
  followers: number | null
): EngagementSummary {
  const reach = reachSummary(reels);
  const interactions = reach.totalLikes + reach.totalComments;

  // Zero-view reels are common on archived media Instagram no longer reports
  // views for. Including them would drag every per-post rate toward a division
  // by zero, so they're dropped from the per-post distribution only — the
  // total-weighted rate above still counts their likes and comments.
  const perPost = reels
    .filter((r) => num(r.view_count) > 0)
    .map((r) => ((num(r.like_count) + num(r.comment_count)) / num(r.view_count)) * 100);

  const avgInteractions = mean(
    reels.map((r) => num(r.like_count) + num(r.comment_count))
  );

  const pct = (v: number | null) => (v == null ? null : v * 100);

  return {
    rateByViews: pct(ratio(interactions, reach.totalViews)),
    medianPostRate: median(perPost),
    rateByFollowers:
      followers && avgInteractions != null ? pct(ratio(avgInteractions, followers)) : null,
    // A median of zero means Instagram reported no view data, not that nobody
    // watched — so this is unknown, not "0.00× reach". Same reasoning that
    // drops zero-view reels from `medianPostRate` above.
    viewsPerFollower:
      followers && reach.medianViews ? ratio(reach.medianViews, followers) : null,
    commentShare: pct(ratio(reach.totalComments, interactions)),
  };
}

export type DistributionSummary = {
  /** best ÷ typical — "their best post did 47× their median post". */
  outlierRatio: number | null;
  /** Share of posts that beat 3× the median. */
  hitRate: number | null;
  /** p90 ÷ median — lower is more predictable. */
  consistency: number | null;
  /** Half-decade view buckets for the histogram, ascending. */
  buckets: { label: string; from: number; to: number; count: number }[];
};

// Views span five orders of magnitude on a single account, so linear buckets
// would put everything in the first bar. Half-decade (√10) log buckets keep the
// shape readable from 100 views to 10M.
//
// The open-ended top edge is MAX_SAFE_INTEGER rather than Infinity on purpose:
// these bucket objects cross the RSC boundary, and `Infinity` serializes to
// `null` in JSON. A `null` upper edge would make `value < bucket.to` false for
// every value, so the top bucket would silently never match — which is exactly
// how the median/p90 markers would go missing on the highest-performing
// accounts, the ones most worth looking at.
const OPEN_EDGE = Number.MAX_SAFE_INTEGER;
const BUCKET_EDGES = [0, 1_000, 3_000, 10_000, 30_000, 100_000, 300_000, 1_000_000, OPEN_EDGE];

export function distributionSummary(reels: ReelPoint[]): DistributionSummary {
  const views = reels.map((r) => num(r.view_count));
  const med = median(views);
  const p90 = percentile(views, 0.9);
  const max = views.length ? Math.max(...views) : null;

  const buckets = BUCKET_EDGES.slice(0, -1).map((from, i) => {
    const to = BUCKET_EDGES[i + 1];
    return {
      label: bucketLabel(from, to),
      from,
      to,
      count: views.filter((v) => v >= from && v < to).length,
    };
  });

  return {
    outlierRatio: med && max != null ? ratio(max, med) : null,
    hitRate:
      med && views.length ? ratio(views.filter((v) => v > med * 3).length, views.length) : null,
    consistency: med && p90 != null ? ratio(p90, med) : null,
    buckets,
  };
}

function bucketLabel(from: number, to: number): string {
  const short = (n: number) =>
    n >= 1_000_000 ? `${n / 1_000_000}M` : n >= 1_000 ? `${n / 1_000}K` : String(n);
  if (to === OPEN_EDGE) return `${short(from)}+`;
  return `${short(from)}–${short(to)}`;
}

/* ------------------------------------------------------------------ *
 * Cadence
 * ------------------------------------------------------------------ */

export type CadenceSummary = {
  firstPostedAt: string | null;
  lastPostedAt: string | null;
  postsPerWeek: number | null;
  /** Typical days between consecutive posts — robust where posts/week is not. */
  medianGapDays: number | null;
  longestGapDays: number | null;
  daysSinceLastPost: number | null;
  /** ISO weeks with at least one post, out of the last 12. */
  activeWeeks: number;
  weeksTracked: number;
};

export function cadenceSummary(reels: ReelPoint[], now = Date.now()): CadenceSummary {
  const times = reels
    .map((r) => (r.posted_at ? new Date(r.posted_at).getTime() : NaN))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);

  if (times.length === 0) {
    return {
      firstPostedAt: null,
      lastPostedAt: null,
      postsPerWeek: null,
      medianGapDays: null,
      longestGapDays: null,
      daysSinceLastPost: null,
      activeWeeks: 0,
      weeksTracked: 12,
    };
  }

  const first = times[0];
  const last = times[times.length - 1];
  const spanWeeks = Math.max((last - first) / (DAY_MS * 7), 1);

  const gaps: number[] = [];
  for (let i = 1; i < times.length; i += 1) {
    gaps.push((times[i] - times[i - 1]) / DAY_MS);
  }

  // Consistency over the last 12 weeks, bucketed by which week-index back from
  // now each post falls into. Cheaper and DST-proof compared to real ISO weeks,
  // and the answer ("11 of the last 12 weeks") is identical.
  const activeWeekIdx = new Set<number>();
  for (const t of times) {
    const weeksAgo = Math.floor((now - t) / (DAY_MS * 7));
    if (weeksAgo >= 0 && weeksAgo < 12) activeWeekIdx.add(weeksAgo);
  }

  return {
    firstPostedAt: new Date(first).toISOString(),
    lastPostedAt: new Date(last).toISOString(),
    postsPerWeek: ratio(times.length, spanWeeks),
    medianGapDays: median(gaps),
    longestGapDays: gaps.length ? Math.max(...gaps) : null,
    daysSinceLastPost: Math.max(0, (now - last) / DAY_MS),
    activeWeeks: activeWeekIdx.size,
    weeksTracked: 12,
  };
}

/* ------------------------------------------------------------------ *
 * Timing — weekday and hour buckets
 * ------------------------------------------------------------------ */

/** `[epochMs, views]` — the compact shape sent to the client for tz re-bucketing. */
export type TimePoint = [number, number];

export function toTimePoints(reels: ReelPoint[]): TimePoint[] {
  return reels
    .filter((r) => r.posted_at)
    .map((r) => [new Date(r.posted_at as string).getTime(), num(r.view_count)] as TimePoint)
    .filter(([t]) => Number.isFinite(t));
}

/**
 * Median views per weekday, Monday-first.
 *
 * `getDay()` is 0=Sun…6=Sat; `(d + 6) % 7` remaps to 0=Mon…6=Sun, matching how
 * the rest of the app labels weekdays.
 */
export function weekdayMedians(
  points: TimePoint[],
  utc = false
): { values: number[]; counts: number[] } {
  const byDay: number[][] = Array.from({ length: 7 }, () => []);
  for (const [t, v] of points) {
    const d = new Date(t);
    const day = utc ? d.getUTCDay() : d.getDay();
    byDay[(day + 6) % 7].push(v);
  }
  return {
    values: byDay.map((xs) => median(xs) ?? 0),
    counts: byDay.map((xs) => xs.length),
  };
}

export type HeatCell = { weekday: number; hour: number; value: number; count: number };

/** 7×24 grid of median views, Monday-first rows, 0–23 hour columns. */
export function hourWeekdayGrid(points: TimePoint[], utc = false): HeatCell[] {
  const buckets: number[][][] = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => [] as number[])
  );
  for (const [t, v] of points) {
    const d = new Date(t);
    const day = ((utc ? d.getUTCDay() : d.getDay()) + 6) % 7;
    const hour = utc ? d.getUTCHours() : d.getHours();
    buckets[day][hour].push(v);
  }

  const cells: HeatCell[] = [];
  for (let weekday = 0; weekday < 7; weekday += 1) {
    for (let hour = 0; hour < 24; hour += 1) {
      const xs = buckets[weekday][hour];
      cells.push({ weekday, hour, value: median(xs) ?? 0, count: xs.length });
    }
  }
  return cells;
}

/* ------------------------------------------------------------------ *
 * Trend — mature-window comparison
 * ------------------------------------------------------------------ */

export type MatureTrend = {
  recentMedian: number | null;
  priorMedian: number | null;
  deltaPct: number | null;
  recentCount: number;
  priorCount: number;
};

/**
 * Recent vs prior performance, comparing **only posts that have had time to
 * mature**.
 *
 * The naive version of this chart — last 30 days vs the 30 before — is the most
 * common wrong number in tools like this. A reel posted 3 days ago has had 3
 * days to accumulate views; one posted 55 days ago has had 55. Comparing them
 * systematically understates the recent period and manufactures a "declining
 * account" story out of nothing.
 *
 * So both buckets are shifted back by `maturityDays`: every post in either
 * window has had at least that long to accumulate. The tradeoff is that the
 * "recent" window is a month stale, which is the honest price of comparability.
 */
export function matureTrend(
  reels: ReelPoint[],
  now = Date.now(),
  maturityDays = 30,
  windowDays = 30
): MatureTrend {
  const cut = (daysAgo: number) => now - daysAgo * DAY_MS;
  const recentFrom = cut(maturityDays + windowDays);
  const recentTo = cut(maturityDays);
  const priorFrom = cut(maturityDays + windowDays * 2);

  const inWindow = (from: number, to: number) =>
    reels
      .filter((r) => {
        if (!r.posted_at) return false;
        const t = new Date(r.posted_at).getTime();
        return Number.isFinite(t) && t >= from && t < to;
      })
      .map((r) => num(r.view_count));

  const recent = inWindow(recentFrom, recentTo);
  const prior = inWindow(priorFrom, recentFrom);

  const recentMedian = median(recent);
  const priorMedian = median(prior);

  // Under 3 posts either side, a "median" is one or two data points and the
  // percentage swing it produces is noise dressed as a trend.
  const comparable = recent.length >= 3 && prior.length >= 3;
  const deltaPct =
    comparable && recentMedian != null && priorMedian != null
      ? (ratio(recentMedian - priorMedian, priorMedian) ?? null)
      : null;

  return {
    recentMedian,
    priorMedian,
    deltaPct: deltaPct == null ? null : deltaPct * 100,
    recentCount: recent.length,
    priorCount: prior.length,
  };
}

/* ------------------------------------------------------------------ *
 * Content signals
 * ------------------------------------------------------------------ */

export type TagStat = { tag: string; count: number; medianViews: number | null };

// \p{L} rather than \w: captions in this product are frequently Arabic, and
// \w would silently match zero characters of an Arabic hashtag.
const HASHTAG_RE = /#[\p{L}\p{N}_]+/gu;
const MENTION_RE = /@[A-Za-z0-9._]+/g;

function tagStats(reels: ReelPoint[], re: RegExp, limit: number): TagStat[] {
  const byTag = new Map<string, number[]>();
  for (const reel of reels) {
    if (!reel.caption) continue;
    // Dedupe within a caption — "#reels #reels #reels" is one post using the tag.
    const tags = new Set(reel.caption.match(re)?.map((t) => t.toLowerCase()) ?? []);
    for (const tag of tags) {
      const bucket = byTag.get(tag);
      if (bucket) bucket.push(num(reel.view_count));
      else byTag.set(tag, [num(reel.view_count)]);
    }
  }

  return Array.from(byTag.entries())
    .map(([tag, views]) => ({ tag, count: views.length, medianViews: median(views) }))
    .sort((a, b) => b.count - a.count || (b.medianViews ?? 0) - (a.medianViews ?? 0))
    .slice(0, limit);
}

export function hashtagStats(reels: ReelPoint[], limit = 10): TagStat[] {
  return tagStats(reels, HASHTAG_RE, limit);
}

export function mentionStats(reels: ReelPoint[], limit = 6): TagStat[] {
  return tagStats(reels, MENTION_RE, limit);
}

export type CaptionBucket = {
  key: "short" | "medium" | "long" | "essay";
  from: number;
  to: number;
  count: number;
  medianViews: number | null;
};

const CAPTION_EDGES: { key: CaptionBucket["key"]; from: number; to: number }[] = [
  { key: "short", from: 0, to: 51 },
  { key: "medium", from: 51, to: 151 },
  { key: "long", from: 151, to: 301 },
  { key: "essay", from: 301, to: Infinity },
];

export function captionBuckets(reels: ReelPoint[]): CaptionBucket[] {
  return CAPTION_EDGES.map(({ key, from, to }) => {
    const views = reels
      .filter((r) => {
        const len = r.caption?.trim().length ?? 0;
        return len >= from && len < to;
      })
      .map((r) => num(r.view_count));
    return { key, from, to, count: views.length, medianViews: median(views) };
  });
}

/* ------------------------------------------------------------------ *
 * Leaderboards
 * ------------------------------------------------------------------ */

export type ReelSummary = {
  id: string;
  caption: string | null;
  thumbnail_url: string | null;
  ig_permalink: string | null;
  posted_at: string | null;
  views: number;
  likes: number;
  comments: number;
  engagementRate: number | null;
};

/** Caption text never crosses the RSC boundary in full — 400 of them is ~200KB. */
const CAPTION_CAP = 120;

export function toReelSummary(reel: ReelPoint): ReelSummary {
  const views = num(reel.view_count);
  const likes = num(reel.like_count);
  const comments = num(reel.comment_count);
  const caption = reel.caption?.replace(/\s+/g, " ").trim() ?? null;
  const rate = ratio(likes + comments, views);
  return {
    id: reel.id,
    caption: caption ? caption.slice(0, CAPTION_CAP) : null,
    thumbnail_url: reel.thumbnail_url,
    ig_permalink: reel.ig_permalink,
    posted_at: reel.posted_at,
    views,
    likes,
    comments,
    engagementRate: rate == null ? null : rate * 100,
  };
}

/** Top/bottom N by views. Zero-view reels are excluded from the bottom list —
 *  they are almost always media Instagram stopped reporting on, not flops. */
export function rankByViews(reels: ReelPoint[], limit = 5): {
  top: ReelSummary[];
  bottom: ReelSummary[];
} {
  const sorted = reels.slice().sort((a, b) => num(b.view_count) - num(a.view_count));
  const scored = sorted.filter((r) => num(r.view_count) > 0);
  return {
    top: sorted.slice(0, limit).map(toReelSummary),
    bottom: scored.slice(-limit).reverse().map(toReelSummary),
  };
}

/* ------------------------------------------------------------------ *
 * Timeline series
 * ------------------------------------------------------------------ */

export type TimelinePoint = { id: string; value: number; href: string | null; at: string | null };

/** Views per post, oldest → newest. The x-axis is *post date*, not measurement
 *  date — nothing in this product measures a reel more than once. */
export function viewsTimeline(reels: ReelPoint[], limit = 60): TimelinePoint[] {
  return reels
    .filter((r) => r.posted_at)
    .slice()
    .sort(
      (a, b) =>
        new Date(a.posted_at as string).getTime() - new Date(b.posted_at as string).getTime()
    )
    .slice(-limit)
    .map((r) => ({
      id: r.id,
      value: num(r.view_count),
      href: r.ig_permalink,
      at: r.posted_at,
    }));
}

/* ------------------------------------------------------------------ *
 * Transcript coverage
 * ------------------------------------------------------------------ */

export function transcriptCoverage(reels: ReelPoint[]): {
  ready: number;
  failed: number;
  pending: number;
  total: number;
  pct: number | null;
} {
  const total = reels.length;
  const count = (status: string) =>
    reels.filter((r) => r.transcript_status === status).length;
  const ready = count("ready");
  const failed = count("failed");
  const pending = count("pending");
  const pct = ratio(ready, total);
  return { ready, failed, pending, total, pct: pct == null ? null : pct * 100 };
}
