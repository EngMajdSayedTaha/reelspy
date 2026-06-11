"use client";

import { BarChart3, TrendingUp } from "lucide-react";

// Dependency-free charts for the My IG section: plain divs for the bars and
// a single SVG polyline for the trend, so there's no chart library to ship.

type ChartInsights = {
  views?: number;
  reach?: number;
  likes?: number;
  comments?: number;
  saved?: number;
  shares?: number;
};

type ChartMedia = {
  id: string;
  timestamp?: string;
  caption?: string;
  like_count?: number;
  comments_count?: number;
  insights: ChartInsights | null;
};

function formatCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 100_000 ? 0 : 1)}K`;
  return new Intl.NumberFormat("en-US").format(value);
}

function shortDate(timestamp?: string): string {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function InsightsCharts({ media }: { media: ChartMedia[] }) {
  // Oldest → newest so both charts read left-to-right in time.
  const analyzed = media
    .filter((m) => m.insights)
    .sort(
      (a, b) => new Date(a.timestamp ?? 0).getTime() - new Date(b.timestamp ?? 0).getTime()
    );

  if (analyzed.length < 3) return null;

  const views = analyzed.map((m) => m.insights?.views ?? 0);
  const maxViews = Math.max(...views, 1);
  const totalViews = views.reduce((sum, v) => sum + v, 0);
  const bestIndex = views.indexOf(Math.max(...views));

  // Engagement rate = interactions / reach per post (skipped when reach is 0).
  const engagement = analyzed.map((m) => {
    const ins = m.insights!;
    const interactions =
      (ins.likes ?? m.like_count ?? 0) +
      (ins.comments ?? m.comments_count ?? 0) +
      (ins.saved ?? 0) +
      (ins.shares ?? 0);
    return ins.reach ? (interactions / ins.reach) * 100 : 0;
  });
  const maxEngagement = Math.max(...engagement, 0.1);
  const avgEngagement =
    engagement.reduce((sum, v) => sum + v, 0) / Math.max(engagement.length, 1);

  // Polyline points in a 100×40 viewBox; preserveAspectRatio="none" stretches
  // it to the container, and non-scaling-stroke keeps the line crisp.
  const linePoints = engagement
    .map((value, i) => {
      const x = (i / (engagement.length - 1)) * 100;
      const y = 38 - (value / maxEngagement) * 34;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  const firstDate = shortDate(analyzed[0].timestamp);
  const lastDate = shortDate(analyzed[analyzed.length - 1].timestamp);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Views per post */}
      <div className="rounded-xl border border-[#1f1f1f] bg-[#141414] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-medium text-zinc-200">
            <BarChart3 className="h-4 w-4 text-[#F9E400]" />
            Views per post
          </p>
          <p className="text-xs text-zinc-500">
            {formatCompact(totalViews)} total · last {analyzed.length} analyzed
          </p>
        </div>

        <div className="mt-4 flex h-32 items-end gap-1 sm:h-36">
          {analyzed.map((m, i) => (
            <div
              key={m.id}
              title={`${shortDate(m.timestamp)} — ${formatCompact(views[i])} views`}
              className={`min-w-0 flex-1 rounded-t transition-colors ${
                i === bestIndex
                  ? "bg-[#F9E400]"
                  : "bg-[#F9E400]/35 hover:bg-[#F9E400]/70"
              }`}
              style={{ height: `${Math.max((views[i] / maxViews) * 100, 2)}%` }}
            />
          ))}
        </div>

        <div className="mt-2 flex justify-between text-[10px] text-zinc-500">
          <span>{firstDate}</span>
          <span className="text-zinc-400">brightest bar = top post</span>
          <span>{lastDate}</span>
        </div>
      </div>

      {/* Engagement rate trend */}
      <div className="rounded-xl border border-[#1f1f1f] bg-[#141414] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-medium text-zinc-200">
            <TrendingUp className="h-4 w-4 text-[#F9E400]" />
            Engagement rate
          </p>
          <p className="text-xs text-zinc-500">
            avg <span className="font-medium text-[#F9E400]">{avgEngagement.toFixed(1)}%</span> of
            reach
          </p>
        </div>

        <svg
          viewBox="0 0 100 40"
          preserveAspectRatio="none"
          aria-hidden
          className="mt-4 h-32 w-full sm:h-36"
        >
          <polygon points={`0,40 ${linePoints} 100,40`} fill="rgba(249, 228, 0, 0.08)" />
          <polyline
            points={linePoints}
            fill="none"
            stroke="#F9E400"
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        <div className="mt-2 flex justify-between text-[10px] text-zinc-500">
          <span>{firstDate}</span>
          <span className="text-zinc-400">likes + comments + saves + shares ÷ reach</span>
          <span>{lastDate}</span>
        </div>
      </div>
    </div>
  );
}
