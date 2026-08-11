import { describe, expect, it } from "vitest";
import {
  cadenceSummary,
  captionBuckets,
  distributionSummary,
  engagementSummary,
  hashtagStats,
  hourWeekdayGrid,
  matureTrend,
  mean,
  median,
  mentionStats,
  percentile,
  rankByViews,
  ratio,
  reachSummary,
  toTimePoints,
  transcriptCoverage,
  viewsTimeline,
  weekdayMedians,
  type ReelPoint,
} from "@/lib/accounts/metrics";

const DAY = 86_400_000;

function reel(overrides: Partial<ReelPoint> = {}): ReelPoint {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    view_count: 0,
    like_count: 0,
    comment_count: 0,
    viral_score: null,
    posted_at: null,
    created_at: null,
    caption: null,
    thumbnail_url: null,
    ig_permalink: null,
    transcript_status: null,
    is_favorite: null,
    is_worked_on: null,
    ...overrides,
  };
}

/** Every finite number produced anywhere in the module, for the NaN sweep. */
function finiteNumbers(value: unknown, path = "root"): [string, unknown][] {
  if (typeof value === "number") return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((v, i) => finiteNumbers(v, `${path}[${i}]`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => finiteNumbers(v, `${path}.${k}`));
  }
  return [];
}

describe("statistics primitives", () => {
  it("percentile interpolates like percentile_cont", () => {
    // Postgres: percentile_cont(0.5) over (1,2,3,4) = 2.5
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(percentile([1, 2, 3], 0.5)).toBe(2);
    expect(percentile([10], 0.5)).toBe(10);
    expect(percentile([], 0.5)).toBeNull();
  });

  it("percentile handles the p90 edge and unsorted input", () => {
    expect(percentile([5, 1, 4, 2, 3], 0.9)).toBeCloseTo(4.6, 5);
    expect(percentile([1, 2], 1)).toBe(2);
    expect(percentile([1, 2], 0)).toBe(1);
  });

  it("median works for odd and even counts", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  it("mean returns null rather than NaN on an empty set", () => {
    expect(mean([])).toBeNull();
    expect(mean([2, 4])).toBe(3);
  });

  it("ratio refuses to emit Infinity or NaN", () => {
    expect(ratio(1, 0)).toBeNull();
    expect(ratio(0, 0)).toBeNull();
    expect(ratio(Number.NaN, 1)).toBeNull();
    expect(ratio(Number.POSITIVE_INFINITY, 1)).toBeNull();
    expect(ratio(3, 2)).toBe(1.5);
  });
});

describe("reach and engagement", () => {
  it("summarizes an empty account without dividing by zero", () => {
    const reach = reachSummary([]);
    expect(reach.count).toBe(0);
    expect(reach.totalViews).toBe(0);
    expect(reach.medianViews).toBeNull();
    expect(reach.maxViews).toBeNull();

    const engagement = engagementSummary([], 1000);
    for (const [path, value] of finiteNumbers(engagement)) {
      expect(Number.isFinite(value as number), path).toBe(true);
    }
    expect(engagement.rateByViews).toBeNull();
    expect(engagement.viewsPerFollower).toBeNull();
  });

  it("handles a single reel", () => {
    const reach = reachSummary([reel({ view_count: 500, like_count: 10, comment_count: 2 })]);
    expect(reach.count).toBe(1);
    expect(reach.medianViews).toBe(500);
    expect(reach.meanViews).toBe(500);
    expect(reach.p90Views).toBe(500);
    expect(reach.maxViews).toBe(500);
  });

  it("excludes zero-view reels from the per-post rate but not from totals", () => {
    const reels = [
      reel({ view_count: 100, like_count: 10, comment_count: 0 }), // 10%
      reel({ view_count: 0, like_count: 5, comment_count: 5 }), // archived, no view data
    ];
    const engagement = engagementSummary(reels, 1000);

    // Per-post distribution sees only the reel with views.
    expect(engagement.medianPostRate).toBeCloseTo(10, 5);
    // Total-weighted rate still counts the zero-view reel's interactions.
    expect(engagement.rateByViews).toBeCloseTo(20, 5);
  });

  it("returns null everywhere when every reel has zero views", () => {
    const reels = [reel({ view_count: 0 }), reel({ view_count: 0 })];
    const engagement = engagementSummary(reels, 500);
    expect(engagement.rateByViews).toBeNull();
    expect(engagement.medianPostRate).toBeNull();
    expect(engagement.viewsPerFollower).toBeNull();
    expect(engagement.commentShare).toBeNull();
  });

  it("returns null follower-based metrics when the follower count is unknown", () => {
    const reels = [reel({ view_count: 100, like_count: 5 })];
    const engagement = engagementSummary(reels, null);
    expect(engagement.rateByFollowers).toBeNull();
    expect(engagement.viewsPerFollower).toBeNull();
    // View-based metrics still work.
    expect(engagement.rateByViews).toBeCloseTo(5, 5);
  });

  it("treats a zero follower count as unknown rather than dividing by it", () => {
    const engagement = engagementSummary([reel({ view_count: 100, like_count: 5 })], 0);
    expect(engagement.rateByFollowers).toBeNull();
    expect(engagement.viewsPerFollower).toBeNull();
  });
});

describe("distribution", () => {
  it("computes outlier ratio, hit rate and consistency", () => {
    const views = [100, 100, 100, 100, 5000];
    const summary = distributionSummary(views.map((v) => reel({ view_count: v })));
    expect(summary.outlierRatio).toBe(50); // 5000 / median 100
    expect(summary.hitRate).toBeCloseTo(0.2, 5); // 1 of 5 beats 3× median
    expect(summary.consistency).not.toBeNull();
  });

  it("buckets every reel exactly once and covers the whole range", () => {
    const views = [0, 999, 1_000, 2_999, 3_000, 250_000, 5_000_000];
    const summary = distributionSummary(views.map((v) => reel({ view_count: v })));
    expect(summary.buckets.reduce((a, b) => a + b.count, 0)).toBe(views.length);
    // The open-ended top bucket catches the 5M reel.
    expect(summary.buckets[summary.buckets.length - 1].count).toBe(1);
  });

  it("survives an all-zero account", () => {
    const summary = distributionSummary([reel(), reel()]);
    expect(summary.outlierRatio).toBeNull();
    expect(summary.hitRate).toBeNull();
    expect(summary.consistency).toBeNull();
  });
});

describe("cadence", () => {
  const now = Date.UTC(2026, 5, 30, 12, 0, 0);

  it("returns nulls, not NaN, with no dated reels", () => {
    const cadence = cadenceSummary([reel(), reel()], now);
    expect(cadence.postsPerWeek).toBeNull();
    expect(cadence.medianGapDays).toBeNull();
    expect(cadence.daysSinceLastPost).toBeNull();
    expect(cadence.activeWeeks).toBe(0);
  });

  it("computes gaps and days since last post", () => {
    const cadence = cadenceSummary(
      [
        reel({ posted_at: new Date(now - 14 * DAY).toISOString() }),
        reel({ posted_at: new Date(now - 7 * DAY).toISOString() }),
        reel({ posted_at: new Date(now - 2 * DAY).toISOString() }),
      ],
      now
    );
    expect(cadence.medianGapDays).toBeCloseTo(6, 5); // gaps of 7 and 5
    expect(cadence.longestGapDays).toBeCloseTo(7, 5);
    expect(cadence.daysSinceLastPost).toBeCloseTo(2, 5);
    expect(cadence.activeWeeks).toBe(3);
  });

  it("never divides by a zero span when every reel shares a timestamp", () => {
    const at = new Date(now - DAY).toISOString();
    const cadence = cadenceSummary([reel({ posted_at: at }), reel({ posted_at: at })], now);
    expect(cadence.postsPerWeek).toBe(2); // span floored to one week
    expect(cadence.medianGapDays).toBe(0);
  });

  it("caps the active-week streak at the 12-week window", () => {
    const reels = Array.from({ length: 40 }, (_, i) =>
      reel({ posted_at: new Date(now - i * 7 * DAY).toISOString() })
    );
    const cadence = cadenceSummary(reels, now);
    expect(cadence.activeWeeks).toBe(12);
    expect(cadence.weeksTracked).toBe(12);
  });
});

describe("timing buckets", () => {
  it("remaps getDay() so index 0 is Monday", () => {
    // 2026-01-05 is a Monday, 2026-01-11 the following Sunday.
    const points = toTimePoints([
      reel({ posted_at: "2026-01-05T12:00:00.000Z", view_count: 100 }),
      reel({ posted_at: "2026-01-11T12:00:00.000Z", view_count: 900 }),
    ]);
    const { values, counts } = weekdayMedians(points, true);
    expect(counts[0]).toBe(1); // Monday
    expect(counts[6]).toBe(1); // Sunday
    expect(values[0]).toBe(100);
    expect(values[6]).toBe(900);
  });

  it("uses medians per weekday, so one viral post cannot crown a day", () => {
    const monday = ["2026-01-05", "2026-01-12", "2026-01-19"].map((d) =>
      reel({ posted_at: `${d}T09:00:00.000Z`, view_count: 1_000 })
    );
    // A single 1M-view Tuesday, plus two ordinary ones.
    const tuesday = [
      reel({ posted_at: "2026-01-06T09:00:00.000Z", view_count: 1_000_000 }),
      reel({ posted_at: "2026-01-13T09:00:00.000Z", view_count: 10 }),
      reel({ posted_at: "2026-01-20T09:00:00.000Z", view_count: 10 }),
    ];
    const { values } = weekdayMedians(toTimePoints([...monday, ...tuesday]), true);
    expect(values[0]).toBe(1_000); // Monday
    expect(values[1]).toBe(10); // Tuesday median, not its 1M mean
  });

  it("builds a complete 7x24 grid even from one post", () => {
    const grid = hourWeekdayGrid(
      toTimePoints([reel({ posted_at: "2026-01-05T14:30:00.000Z", view_count: 42 })]),
      true
    );
    expect(grid).toHaveLength(7 * 24);
    const cell = grid.find((c) => c.weekday === 0 && c.hour === 14);
    expect(cell).toMatchObject({ value: 42, count: 1 });
    expect(grid.filter((c) => c.count > 0)).toHaveLength(1);
  });

  it("drops undated reels instead of bucketing them at the epoch", () => {
    expect(toTimePoints([reel(), reel({ posted_at: "not-a-date" })])).toHaveLength(0);
  });
});

describe("mature trend", () => {
  const now = Date.UTC(2026, 5, 30, 0, 0, 0);
  const at = (daysAgo: number) => new Date(now - daysAgo * DAY).toISOString();

  it("ignores the immature last 30 days entirely", () => {
    const reels = [
      // Immature — inside the maturity buffer, must not enter either window.
      ...[5, 10, 15].map((d) => reel({ posted_at: at(d), view_count: 1 })),
      // Recent mature window: 30-60 days ago.
      ...[35, 40, 45].map((d) => reel({ posted_at: at(d), view_count: 200 })),
      // Prior window: 60-90 days ago.
      ...[65, 70, 75].map((d) => reel({ posted_at: at(d), view_count: 100 })),
    ];
    const trend = matureTrend(reels, now);
    expect(trend.recentCount).toBe(3);
    expect(trend.priorCount).toBe(3);
    expect(trend.recentMedian).toBe(200);
    expect(trend.priorMedian).toBe(100);
    expect(trend.deltaPct).toBeCloseTo(100, 5);
  });

  it("refuses a delta when either window has under 3 posts", () => {
    const reels = [
      ...[35, 40].map((d) => reel({ posted_at: at(d), view_count: 200 })),
      ...[65, 70, 75].map((d) => reel({ posted_at: at(d), view_count: 100 })),
    ];
    const trend = matureTrend(reels, now);
    expect(trend.recentCount).toBe(2);
    expect(trend.deltaPct).toBeNull();
  });

  it("refuses a delta rather than dividing by a zero prior median", () => {
    const reels = [
      ...[35, 40, 45].map((d) => reel({ posted_at: at(d), view_count: 200 })),
      ...[65, 70, 75].map((d) => reel({ posted_at: at(d), view_count: 0 })),
    ];
    const trend = matureTrend(reels, now);
    expect(trend.priorMedian).toBe(0);
    expect(trend.deltaPct).toBeNull();
  });
});

describe("content signals", () => {
  it("matches Arabic hashtags, which \\w would silently miss", () => {
    const reels = [
      reel({ caption: "وصفة اليوم #طبخ #وصفات", view_count: 100 }),
      reel({ caption: "#طبخ again", view_count: 300 }),
    ];
    const tags = hashtagStats(reels);
    const cooking = tags.find((t) => t.tag === "#طبخ");
    expect(cooking).toBeDefined();
    expect(cooking?.count).toBe(2);
    expect(cooking?.medianViews).toBe(200);
  });

  it("counts a repeated hashtag once per caption", () => {
    const tags = hashtagStats([reel({ caption: "#reels #reels #REELS", view_count: 10 })]);
    expect(tags).toHaveLength(1);
    expect(tags[0].count).toBe(1);
  });

  it("survives emoji and captions with no tags at all", () => {
    const tags = hashtagStats([reel({ caption: "🔥🔥🔥 no tags here" }), reel({ caption: null })]);
    expect(tags).toEqual([]);
  });

  it("extracts mentions separately from hashtags", () => {
    const mentions = mentionStats([reel({ caption: "collab with @some.brand #ad" })]);
    expect(mentions.map((m) => m.tag)).toEqual(["@some.brand"]);
  });

  it("buckets caption lengths without gaps or overlaps", () => {
    const buckets = captionBuckets([
      reel({ caption: "x".repeat(10), view_count: 1 }),
      reel({ caption: "x".repeat(50), view_count: 2 }),
      reel({ caption: "x".repeat(51), view_count: 3 }),
      reel({ caption: "x".repeat(300), view_count: 4 }),
      reel({ caption: "x".repeat(301), view_count: 5 }),
      reel({ caption: null, view_count: 6 }),
    ]);
    expect(buckets.reduce((a, b) => a + b.count, 0)).toBe(6);
    expect(buckets.find((b) => b.key === "short")?.count).toBe(3); // 10, 50, null→0
    expect(buckets.find((b) => b.key === "essay")?.count).toBe(1);
  });

  it("reports transcript coverage without dividing by zero", () => {
    expect(transcriptCoverage([]).pct).toBeNull();
    const coverage = transcriptCoverage([
      reel({ transcript_status: "ready" }),
      reel({ transcript_status: "failed" }),
      reel({ transcript_status: null }),
      reel({ transcript_status: "ready" }),
    ]);
    expect(coverage).toMatchObject({ ready: 2, failed: 1, total: 4 });
    expect(coverage.pct).toBe(50);
  });
});

describe("leaderboards and series", () => {
  it("ranks top by views and excludes zero-view reels from the bottom list", () => {
    const reels = [
      reel({ id: "a", view_count: 900 }),
      reel({ id: "b", view_count: 10 }),
      reel({ id: "c", view_count: 0 }), // no view data, not a flop
      reel({ id: "d", view_count: 500 }),
    ];
    const { top, bottom } = rankByViews(reels, 2);
    expect(top.map((r) => r.id)).toEqual(["a", "d"]);
    expect(bottom.map((r) => r.id)).toEqual(["b", "d"]);
    expect(bottom.some((r) => r.id === "c")).toBe(false);
  });

  it("truncates captions and computes a per-reel engagement rate", () => {
    const [entry] = rankByViews([
      reel({ id: "a", view_count: 1_000, like_count: 90, comment_count: 10, caption: "x".repeat(400) }),
    ]).top;
    expect(entry.caption).toHaveLength(120);
    expect(entry.engagementRate).toBeCloseTo(10, 5);
  });

  it("collapses caption whitespace so a multi-line caption stays one line", () => {
    const [entry] = rankByViews([reel({ caption: "line one\n\n  line two" })]).top;
    expect(entry.caption).toBe("line one line two");
  });

  it("orders the timeline oldest to newest and keeps the tail", () => {
    const reels = [
      reel({ id: "old", posted_at: "2026-01-01T00:00:00.000Z", view_count: 1 }),
      reel({ id: "mid", posted_at: "2026-02-01T00:00:00.000Z", view_count: 2 }),
      reel({ id: "new", posted_at: "2026-03-01T00:00:00.000Z", view_count: 3 }),
    ];
    expect(viewsTimeline(reels).map((p) => p.id)).toEqual(["old", "mid", "new"]);
    // The limit keeps the most RECENT n, not the first n.
    expect(viewsTimeline(reels, 2).map((p) => p.id)).toEqual(["mid", "new"]);
  });
});

describe("no metric ever emits NaN or Infinity", () => {
  const hostile: ReelPoint[][] = [
    [],
    [reel()],
    [reel({ view_count: null, like_count: null, comment_count: null })],
    [reel({ view_count: 0, like_count: 0, comment_count: 0, posted_at: "2026-01-01T00:00:00.000Z" })],
    [reel({ viral_score: "not-a-number", view_count: 5 })],
  ];

  it.each(hostile.map((reels, i) => [i, reels]))("case %i", (_i, reels) => {
    const results = {
      reach: reachSummary(reels as ReelPoint[]),
      engagement: engagementSummary(reels as ReelPoint[], 0),
      distribution: distributionSummary(reels as ReelPoint[]),
      cadence: cadenceSummary(reels as ReelPoint[]),
      trend: matureTrend(reels as ReelPoint[]),
      weekday: weekdayMedians(toTimePoints(reels as ReelPoint[])),
      coverage: transcriptCoverage(reels as ReelPoint[]),
      ranked: rankByViews(reels as ReelPoint[]),
    };
    for (const [path, value] of finiteNumbers(results)) {
      expect(Number.isFinite(value as number), `${path} = ${value}`).toBe(true);
    }
  });
});
