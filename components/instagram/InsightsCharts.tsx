"use client";

import { BarChart3, LineChart as LineChartIcon, PieChart } from "lucide-react";

type MediaInsights = {
  views?: number;
  reach?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saved?: number;
  total_interactions?: number;
  avg_watch_time_ms?: number;
};

type MediaItem = {
  id: string;
  caption?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
  insights: MediaInsights | null;
};

type Totals = {
  analyzed: number;
  views: number;
  reach: number;
  likes: number;
  comments: number;
  saved: number;
  shares: number;
};

// On-brand palette — yellow is the hero metric, the rest are calm accents.
const COLORS = {
  views: "#F9E400",
  reach: "#FBBF24",
  likes: "#F472B6",
  comments: "#60A5FA",
  saved: "#34D399",
  shares: "#A78BFA",
} as const;

function formatCompact(value: number | null | undefined): string {
  const n = value ?? 0;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1)}K`;
  return new Intl.NumberFormat("en-US").format(n);
}

function shortDate(ts?: string): string {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function ChartCard({
  title,
  icon,
  hint,
  className = "",
  children,
}: {
  title: string;
  icon: React.ReactNode;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border border-[#1f1f1f] bg-[#141414] p-4 ${className}`}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-medium text-white">
          <span className="text-[#F9E400]">{icon}</span>
          {title}
        </h3>
        {hint ? <span className="text-[11px] text-zinc-500">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

/** Vertical bar chart of views per reel, oldest → newest. Tallest bar is highlighted. */
function ViewsBarChart({ reels }: { reels: MediaItem[] }) {
  const data = reels.map((r) => ({
    value: r.insights?.views ?? r.like_count ?? 0,
    date: shortDate(r.timestamp),
  }));
  const max = Math.max(1, ...data.map((d) => d.value));
  const peak = data.reduce((m, d) => Math.max(m, d.value), 0);

  const W = 100;
  const H = 42;
  const n = data.length;
  const gap = n > 1 ? 1.5 : 0;
  const barW = (W - gap * (n - 1)) / n;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H + 6}`} className="h-44 w-full" preserveAspectRatio="none">
        {data.map((d, i) => {
          const h = (d.value / max) * H;
          const x = i * (barW + gap);
          const isPeak = d.value === peak && peak > 0;
          return (
            <g key={i}>
              <rect
                x={x}
                y={H - h}
                width={barW}
                height={Math.max(h, 0.4)}
                rx={barW > 3 ? 0.8 : 0.3}
                fill={isPeak ? COLORS.views : "#3f3f46"}
                className="transition-opacity hover:opacity-80"
              >
                <title>{`${d.date} — ${formatCompact(d.value)} views`}</title>
              </rect>
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-zinc-600">
        <span>{data[0]?.date}</span>
        <span>{data[data.length - 1]?.date}</span>
      </div>
    </div>
  );
}

/** Donut of how total engagement splits across likes / comments / saves / shares. */
function EngagementDonut({ totals }: { totals: Totals }) {
  const segments = [
    { label: "Likes", value: totals.likes, color: COLORS.likes },
    { label: "Comments", value: totals.comments, color: COLORS.comments },
    { label: "Saves", value: totals.saved, color: COLORS.saved },
    { label: "Shares", value: totals.shares, color: COLORS.shares },
  ].filter((s) => s.value > 0);

  const sum = segments.reduce((a, s) => a + s.value, 0);
  const radius = 15.915; // circumference ≈ 100, so values map to % directly
  let offset = 25; // start at 12 o'clock

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative h-32 w-32 shrink-0">
        <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
          <circle cx="18" cy="18" r={radius} fill="none" stroke="#1f1f1f" strokeWidth="4" />
          {sum > 0 &&
            segments.map((s) => {
              const pct = (s.value / sum) * 100;
              const dash = `${pct} ${100 - pct}`;
              const circle = (
                <circle
                  key={s.label}
                  cx="18"
                  cy="18"
                  r={radius}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="4"
                  strokeDasharray={dash}
                  strokeDashoffset={offset}
                  strokeLinecap="butt"
                >
                  <title>{`${s.label}: ${formatCompact(s.value)} (${pct.toFixed(0)}%)`}</title>
                </circle>
              );
              offset -= pct;
              return circle;
            })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-base font-semibold text-white">{formatCompact(sum)}</span>
          <span className="text-[10px] text-zinc-500">interactions</span>
        </div>
      </div>
      <ul className="flex w-full flex-col gap-1.5">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-1.5 text-zinc-300">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
              {s.label}
            </span>
            <span className="font-medium text-white">
              {formatCompact(s.value)}
              <span className="ml-1 text-zinc-500">
                {sum > 0 ? `${((s.value / sum) * 100).toFixed(0)}%` : "0%"}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Engagement rate (interactions ÷ views) per reel over time, as a smooth line. */
function EngagementRateLine({ reels }: { reels: MediaItem[] }) {
  const data = reels
    .map((r) => {
      const ins = r.insights;
      if (!ins) return null;
      const views = ins.views ?? 0;
      const interactions =
        ins.total_interactions ??
        (ins.likes ?? 0) + (ins.comments ?? 0) + (ins.saved ?? 0) + (ins.shares ?? 0);
      if (views <= 0) return null;
      return { rate: (interactions / views) * 100, date: shortDate(r.timestamp) };
    })
    .filter((d): d is { rate: number; date: string } => d != null);

  if (data.length < 2) return null;

  const W = 100;
  const H = 40;
  const max = Math.max(...data.map((d) => d.rate));
  const min = Math.min(...data.map((d) => d.rate));
  const range = max - min || 1;
  const avg = data.reduce((a, d) => a + d.rate, 0) / data.length;

  const pts = data.map((d, i) => {
    const x = data.length > 1 ? (i / (data.length - 1)) * W : 0;
    const y = H - ((d.rate - min) / range) * H;
    return { x, y, ...d };
  });

  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;

  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-xl font-semibold text-[#F9E400]">{avg.toFixed(1)}%</span>
        <span className="text-xs text-zinc-500">avg engagement rate</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-28 w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="rateFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COLORS.views} stopOpacity="0.28" />
            <stop offset="100%" stopColor={COLORS.views} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#rateFill)" />
        <path
          d={line}
          fill="none"
          stroke={COLORS.views}
          strokeWidth="1"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-zinc-600">
        <span>{data[0]?.date}</span>
        <span>{data[data.length - 1]?.date}</span>
      </div>
    </div>
  );
}

export function InsightsCharts({ reels, totals }: { reels: MediaItem[]; totals: Totals }) {
  // Only reels Instagram returned insights for, oldest → newest for time trends.
  const analyzed = reels
    .filter((r) => r.insights)
    .slice()
    .sort((a, b) => {
      const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return ta - tb;
    });

  const hasEngagement = totals.likes + totals.comments + totals.saved + totals.shares > 0;

  if (analyzed.length === 0 && !hasEngagement) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {analyzed.length > 0 ? (
        <ChartCard
          title="Views per reel"
          icon={<BarChart3 className="h-4 w-4" />}
          hint={`Last ${analyzed.length} analyzed`}
          className="lg:col-span-2"
        >
          <ViewsBarChart reels={analyzed} />
        </ChartCard>
      ) : null}

      {hasEngagement ? (
        <ChartCard title="Engagement mix" icon={<PieChart className="h-4 w-4" />}>
          <EngagementDonut totals={totals} />
        </ChartCard>
      ) : null}

      {analyzed.length >= 2 ? (
        <ChartCard
          title="Engagement rate trend"
          icon={<LineChartIcon className="h-4 w-4" />}
          hint="interactions ÷ views"
          className="lg:col-span-3"
        >
          <EngagementRateLine reels={analyzed} />
        </ChartCard>
      ) : null}
    </div>
  );
}
