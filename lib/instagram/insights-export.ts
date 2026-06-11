// Client-side helpers for the My IG insights section: shared media types and
// exporters (CSV / JSON / AI-ready markdown). No server dependencies — these
// run in the browser so the user can download or copy their own data.

export type MediaInsights = {
  views?: number;
  reach?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saved?: number;
  total_interactions?: number;
  avg_watch_time_ms?: number;
};

export type MediaItem = {
  id: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  permalink?: string;
  thumbnail_url?: string;
  media_url?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
  insights: MediaInsights | null;
};

export type Totals = {
  analyzed: number;
  views: number;
  reach: number;
  likes: number;
  comments: number;
  saved: number;
  shares: number;
};

export type ProfileSummary = {
  username?: string;
  followers_count?: number;
  media_count?: number;
  biography?: string;
};

export function isReelItem(item: MediaItem): boolean {
  return (
    String(item.media_product_type ?? "").toUpperCase() === "REELS" ||
    String(item.media_type ?? "").toUpperCase() === "VIDEO"
  );
}

export function formatCompact(value: number | null | undefined): string {
  const n = value ?? 0;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1)}K`;
  return new Intl.NumberFormat("en-US").format(n);
}

export function interactionsOf(item: MediaItem): number {
  const ins = item.insights;
  if (!ins) return (item.like_count ?? 0) + (item.comments_count ?? 0);
  return (
    ins.total_interactions ??
    (ins.likes ?? 0) + (ins.comments ?? 0) + (ins.saved ?? 0) + (ins.shares ?? 0)
  );
}

/** Engagement rate as a percentage (interactions ÷ views), or null without views. */
export function engagementRateOf(item: MediaItem): number | null {
  const views = item.insights?.views ?? 0;
  if (views <= 0) return null;
  return (interactionsOf(item) / views) * 100;
}

function isoDate(ts?: string): string {
  return ts ? new Date(ts).toISOString().slice(0, 10) : "";
}

function csvEscape(value: string | number | null | undefined): string {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildInsightsCsv(media: MediaItem[]): string {
  const header = [
    "date",
    "type",
    "views",
    "reach",
    "likes",
    "comments",
    "saves",
    "shares",
    "engagement_rate_pct",
    "avg_watch_time_s",
    "caption",
    "permalink",
    "id",
  ];
  const rows = media.map((m) => {
    const ins = m.insights;
    const rate = engagementRateOf(m);
    return [
      isoDate(m.timestamp),
      isReelItem(m) ? "reel" : (m.media_type ?? "post").toLowerCase(),
      ins?.views ?? "",
      ins?.reach ?? "",
      ins?.likes ?? m.like_count ?? "",
      ins?.comments ?? m.comments_count ?? "",
      ins?.saved ?? "",
      ins?.shares ?? "",
      rate != null ? rate.toFixed(2) : "",
      ins?.avg_watch_time_ms != null ? (ins.avg_watch_time_ms / 1000).toFixed(1) : "",
      m.caption?.replace(/\s+/g, " ").slice(0, 300) ?? "",
      m.permalink ?? "",
      m.id,
    ]
      .map(csvEscape)
      .join(",");
  });
  return [header.join(","), ...rows].join("\n");
}

export function buildInsightsJson(
  profile: ProfileSummary | null,
  totals: Totals | null,
  media: MediaItem[]
): string {
  return JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      account: profile ?? undefined,
      totals: totals ?? undefined,
      posts: media.map((m) => ({
        id: m.id,
        date: m.timestamp,
        type: isReelItem(m) ? "reel" : (m.media_type ?? "post").toLowerCase(),
        caption: m.caption,
        permalink: m.permalink,
        like_count: m.like_count,
        comments_count: m.comments_count,
        insights: m.insights,
        engagement_rate_pct: engagementRateOf(m),
      })),
    },
    null,
    2
  );
}

function avg(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

/** % change between the older and newer half of a chronological series. */
export function halfOverHalfDelta(values: number[]): number | null {
  if (values.length < 4) return null;
  const mid = Math.floor(values.length / 2);
  const older = avg(values.slice(0, mid));
  const newer = avg(values.slice(mid));
  if (older <= 0) return null;
  return ((newer - older) / older) * 100;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Markdown account report built for pasting into an AI chat: account context,
 * totals, averages, trends, top/bottom posts and a compact per-post table.
 */
export function buildAiSummary(
  profile: ProfileSummary | null,
  media: MediaItem[]
): string {
  const analyzed = media
    .filter((m) => m.insights)
    .slice()
    .sort(
      (a, b) =>
        (a.timestamp ? new Date(a.timestamp).getTime() : 0) -
        (b.timestamp ? new Date(b.timestamp).getTime() : 0)
    );

  const lines: string[] = [];
  const name = profile?.username ? `@${profile.username}` : "my account";
  lines.push(`# Instagram insights report — ${name}`);
  lines.push(`Generated: ${new Date().toISOString().slice(0, 10)}`);
  lines.push("");

  lines.push("## Account");
  if (profile?.followers_count != null) lines.push(`- Followers: ${profile.followers_count}`);
  if (profile?.media_count != null) lines.push(`- Lifetime posts: ${profile.media_count}`);
  if (analyzed.length > 0) {
    lines.push(
      `- Window analyzed: ${analyzed.length} posts, ${isoDate(analyzed[0].timestamp)} → ${isoDate(
        analyzed[analyzed.length - 1].timestamp
      )}`
    );
  }
  lines.push("");

  if (analyzed.length === 0) {
    lines.push("_No posts with full insights yet — sync the account and re-export._");
    return lines.join("\n");
  }

  const sum = (get: (m: MediaItem) => number) => analyzed.reduce((a, m) => a + get(m), 0);
  const views = sum((m) => m.insights?.views ?? 0);
  const reach = sum((m) => m.insights?.reach ?? 0);
  const likes = sum((m) => m.insights?.likes ?? m.like_count ?? 0);
  const comments = sum((m) => m.insights?.comments ?? m.comments_count ?? 0);
  const saved = sum((m) => m.insights?.saved ?? 0);
  const shares = sum((m) => m.insights?.shares ?? 0);
  const interactions = likes + comments + saved + shares;

  lines.push("## Totals (analyzed window)");
  lines.push(`- Views: ${views}`);
  lines.push(`- Reach: ${reach}`);
  lines.push(`- Likes: ${likes} · Comments: ${comments} · Saves: ${saved} · Shares: ${shares}`);
  lines.push("");

  const watchTimes = analyzed
    .map((m) => m.insights?.avg_watch_time_ms)
    .filter((v): v is number => v != null);
  lines.push("## Averages per post");
  lines.push(`- Avg views: ${Math.round(views / analyzed.length)}`);
  lines.push(`- Avg reach: ${Math.round(reach / analyzed.length)}`);
  lines.push(
    `- Avg engagement rate: ${views > 0 ? ((interactions / views) * 100).toFixed(2) : "n/a"}% (interactions ÷ views)`
  );
  if (profile?.followers_count) {
    lines.push(
      `- Avg views vs followers: ${((views / analyzed.length / profile.followers_count) * 100).toFixed(1)}%`
    );
  }
  if (watchTimes.length > 0) {
    lines.push(`- Avg watch time (reels): ${(avg(watchTimes) / 1000).toFixed(1)}s`);
  }
  lines.push("");

  const viewsDelta = halfOverHalfDelta(analyzed.map((m) => m.insights?.views ?? 0));
  const rateSeries = analyzed
    .map((m) => engagementRateOf(m))
    .filter((v): v is number => v != null);
  const rateDelta = halfOverHalfDelta(rateSeries);
  lines.push("## Trend (older half vs newer half of the window)");
  lines.push(
    `- Views: ${viewsDelta == null ? "not enough data" : `${viewsDelta >= 0 ? "+" : ""}${viewsDelta.toFixed(1)}%`}`
  );
  lines.push(
    `- Engagement rate: ${rateDelta == null ? "not enough data" : `${rateDelta >= 0 ? "+" : ""}${rateDelta.toFixed(1)}%`}`
  );
  lines.push("");

  // Posting cadence + best weekday by average views.
  const first = new Date(analyzed[0].timestamp ?? Date.now()).getTime();
  const last = new Date(analyzed[analyzed.length - 1].timestamp ?? Date.now()).getTime();
  const weeks = Math.max((last - first) / (7 * 24 * 3600 * 1000), 1);
  const byDay = new Map<number, number[]>();
  for (const m of analyzed) {
    if (!m.timestamp) continue;
    const d = new Date(m.timestamp).getDay();
    byDay.set(d, [...(byDay.get(d) ?? []), m.insights?.views ?? 0]);
  }
  const bestDay = [...byDay.entries()]
    .map(([d, v]) => ({ day: WEEKDAYS[d], avg: avg(v), posts: v.length }))
    .sort((a, b) => b.avg - a.avg)[0];
  lines.push("## Posting patterns");
  lines.push(`- Posting frequency: ~${(analyzed.length / weeks).toFixed(1)} posts/week`);
  if (bestDay) {
    lines.push(
      `- Best weekday by avg views: ${bestDay.day} (${Math.round(bestDay.avg)} avg views over ${bestDay.posts} posts)`
    );
  }
  lines.push("");

  const ranked = analyzed
    .slice()
    .sort((a, b) => (b.insights?.views ?? 0) - (a.insights?.views ?? 0));
  const describe = (m: MediaItem) => {
    const cap = m.caption?.replace(/\s+/g, " ").slice(0, 80) ?? "(no caption)";
    const rate = engagementRateOf(m);
    return `${isoDate(m.timestamp)} — ${m.insights?.views ?? 0} views, ${
      m.insights?.likes ?? m.like_count ?? 0
    } likes${rate != null ? `, ${rate.toFixed(1)}% ER` : ""} — "${cap}"`;
  };
  lines.push("## Top 3 posts by views");
  ranked.slice(0, 3).forEach((m, i) => lines.push(`${i + 1}. ${describe(m)}`));
  lines.push("");
  lines.push("## Bottom 3 posts by views");
  ranked
    .slice(-3)
    .reverse()
    .forEach((m, i) => lines.push(`${i + 1}. ${describe(m)}`));
  lines.push("");

  lines.push("## Per-post data");
  lines.push("| date | type | views | reach | likes | comments | saves | shares | ER % | watch s |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const m of analyzed.slice().reverse()) {
    const ins = m.insights;
    const rate = engagementRateOf(m);
    lines.push(
      `| ${isoDate(m.timestamp)} | ${isReelItem(m) ? "reel" : "post"} | ${ins?.views ?? ""} | ${
        ins?.reach ?? ""
      } | ${ins?.likes ?? m.like_count ?? ""} | ${ins?.comments ?? m.comments_count ?? ""} | ${
        ins?.saved ?? ""
      } | ${ins?.shares ?? ""} | ${rate != null ? rate.toFixed(1) : ""} | ${
        ins?.avg_watch_time_ms != null ? (ins.avg_watch_time_ms / 1000).toFixed(1) : ""
      } |`
    );
  }

  return lines.join("\n");
}

export function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
