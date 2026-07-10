"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  Bookmark,
  CalendarDays,
  Clock,
  Eye,
  Heart,
  LineChart as LineChartIcon,
  MessageCircle,
  PieChart,
  Send,
  TrendingDown,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";
import {
  engagementRateOf,
  formatCompact,
  halfOverHalfDelta,
  interactionsOf,
  type MediaItem,
} from "@/lib/instagram/insights-export";
import { useDict, useLocale } from "@/lib/i18n/I18nProvider";
import { intlLocale } from "@/lib/i18n/intl";
import type { Dict } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";

// On-brand palette — the hero metric (views) follows the active color theme,
// the rest are calm accents. CSS variables are valid SVG fill/stroke values,
// so the whole chart re-colors with the theme and per light/dark mode.
const COLORS = {
  views: "var(--chart-1)",
  reach: "var(--chart-2)",
  likes: "var(--chart-3)",
  comments: "var(--chart-4)",
  saved: "var(--chart-5)",
  shares: "var(--chart-6)",
  watch: "var(--chart-7)",
} as const;

type MetricKey = keyof typeof COLORS;

type MetricDef = {
  key: MetricKey;
  label: string;
  icon: React.ReactNode;
  get: (m: MediaItem) => number | null;
  format: (v: number) => string;
};

function buildMetrics(dict: Dict["myAccount"]["metrics"]): MetricDef[] {
  return [
    {
      key: "views",
      label: dict.views,
      icon: <Eye className="h-3.5 w-3.5" />,
      get: (m) => m.insights?.views ?? null,
      format: formatCompact,
    },
    {
      key: "reach",
      label: dict.reach,
      icon: <Users className="h-3.5 w-3.5" />,
      get: (m) => m.insights?.reach ?? null,
      format: formatCompact,
    },
    {
      key: "likes",
      label: dict.likes,
      icon: <Heart className="h-3.5 w-3.5" />,
      get: (m) => m.insights?.likes ?? m.like_count ?? null,
      format: formatCompact,
    },
    {
      key: "comments",
      label: dict.comments,
      icon: <MessageCircle className="h-3.5 w-3.5" />,
      get: (m) => m.insights?.comments ?? m.comments_count ?? null,
      format: formatCompact,
    },
    {
      key: "saved",
      label: dict.saved,
      icon: <Bookmark className="h-3.5 w-3.5" />,
      get: (m) => m.insights?.saved ?? null,
      format: formatCompact,
    },
    {
      key: "shares",
      label: dict.shares,
      icon: <Send className="h-3.5 w-3.5" />,
      get: (m) => m.insights?.shares ?? null,
      format: formatCompact,
    },
    {
      key: "watch",
      label: dict.watch,
      icon: <Clock className="h-3.5 w-3.5" />,
      get: (m) => m.insights?.avg_watch_time_ms ?? null,
      format: (v) => `${(v / 1000).toFixed(1)}s`,
    },
  ];
}

type RangeDef = { key: RangeKey; label: string; days: number | null };
type RangeKey = "7" | "30" | "90" | "all";

function buildRanges(dict: Dict["myAccount"]["ranges"]): RangeDef[] {
  return [
    { key: "7", label: dict.d7, days: 7 },
    { key: "30", label: dict.d30, days: 30 },
    { key: "90", label: dict.d90, days: 90 },
    { key: "all", label: dict.all, days: null },
  ];
}

// Locale-correct short weekday names (Mon…Sun), replacing a hardcoded English
// array — Jan 5, 2026 is a known Monday, used only as a formatting anchor.
function weekdayLabels(locale: string): string[] {
  const fmt = new Intl.DateTimeFormat(locale, { weekday: "short" });
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2026, 0, 5 + i)));
}

function shortDate(ts: string | undefined, locale: Locale): string {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString(intlLocale(locale), { month: "short", day: "numeric" });
}

function Pill({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "bg-secondary text-muted-foreground hover:bg-border-strong hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function ChartCard({
  title,
  icon,
  hint,
  className = "",
  actions,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  hint?: string;
  className?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border border-border bg-surface-2 p-4 ${className}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <span className="text-brand">{icon}</span>
          {title}
          {hint ? <span className="ms-1 text-[11px] font-normal text-subtle">{hint}</span> : null}
        </h3>
        {actions}
      </div>
      {children}
    </div>
  );
}

/** Floating tooltip anchored at a horizontal percentage inside a chart. */
function ChartTooltip({ leftPct, children }: { leftPct: number; children: React.ReactNode }) {
  const clamped = Math.min(86, Math.max(14, leftPct));
  return (
    <div
      className="pointer-events-none absolute top-0 z-10 w-44 -translate-x-1/2 -translate-y-2 rounded-lg border border-border-strong bg-background/95 p-2.5 shadow-xl backdrop-blur-sm"
      style={{ left: `${clamped}%` }}
    >
      {children}
    </div>
  );
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta == null) return null;
  const up = delta >= 0;
  return (
    <span
      className={`flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
        up ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
      }`}
    >
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? "+" : ""}
      {delta.toFixed(0)}%
    </span>
  );
}

function KpiCard({
  label,
  value,
  delta,
  icon,
}: {
  label: string;
  value: string;
  delta?: number | null;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-2 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs text-subtle">
          {icon}
          {label}
        </span>
        {delta !== undefined ? <DeltaBadge delta={delta} /> : null}
      </div>
      <p className="mt-1.5 text-xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

/** Interactive bar chart of the selected metric per post, with avg line + tooltip. */
function MetricBarChart({
  items,
  metricKey,
  metrics,
  dict,
  locale,
}: {
  items: MediaItem[];
  metricKey: MetricKey;
  metrics: MetricDef[];
  dict: Dict["myAccount"];
  locale: Locale;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const metric = metrics.find((m) => m.key === metricKey)!;

  const data = items.map((m) => ({ item: m, value: metric.get(m) ?? 0 }));
  const max = Math.max(1, ...data.map((d) => d.value));
  const mean = data.length ? data.reduce((a, d) => a + d.value, 0) / data.length : 0;
  const peakIdx = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0);

  const W = 100;
  const H = 42;
  const n = data.length;
  const gap = n > 1 ? 1.5 : 0;
  const barW = (W - gap * (n - 1)) / n;
  const meanY = H - (mean / max) * H;

  return (
    <div className="relative" onMouseLeave={() => setHover(null)}>
      {hover != null ? (
        <ChartTooltip leftPct={((hover + 0.5) / n) * 100}>
          <p className="text-[10px] text-subtle">
            {shortDate(data[hover].item.timestamp, locale)} ·{" "}
            {String(data[hover].item.media_product_type ?? data[hover].item.media_type ?? "post").toLowerCase()}
          </p>
          <p className="text-sm font-semibold" style={{ color: COLORS[metricKey] }}>
            {metric.format(data[hover].value)} {metric.label.toLowerCase()}
          </p>
          <p className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-0.5">
              <Heart className="h-2.5 w-2.5" />
              {formatCompact(data[hover].item.insights?.likes ?? data[hover].item.like_count)}
            </span>
            <span className="flex items-center gap-0.5">
              <MessageCircle className="h-2.5 w-2.5" />
              {formatCompact(data[hover].item.insights?.comments ?? data[hover].item.comments_count)}
            </span>
            {engagementRateOf(data[hover].item) != null ? (
              <span>{engagementRateOf(data[hover].item)!.toFixed(1)}% ER</span>
            ) : null}
          </p>
          {data[hover].item.caption ? (
            <p className="mt-1 line-clamp-2 text-[10px] text-subtle">{data[hover].item.caption}</p>
          ) : null}
        </ChartTooltip>
      ) : null}

      <svg viewBox={`0 0 ${W} ${H}`} className="h-48 w-full" preserveAspectRatio="none">
        {/* Subtle horizontal gridlines */}
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="var(--chart-grid)" strokeWidth="0.3" />
        ))}
        {/* Average reference line */}
        {mean > 0 ? (
          <line
            x1="0"
            x2={W}
            y1={meanY}
            y2={meanY}
            stroke="var(--chart-axis)"
            strokeWidth="0.4"
            strokeDasharray="1.5 1.5"
          />
        ) : null}
        {data.map((d, i) => {
          const h = (d.value / max) * H;
          const x = i * (barW + gap);
          const isPeak = i === peakIdx && d.value > 0;
          const dimmed = hover != null && hover !== i;
          return (
            <g key={d.item.id}>
              <rect
                x={x}
                y={H - h}
                width={barW}
                height={Math.max(h, 0.4)}
                rx={barW > 3 ? 0.8 : 0.3}
                fill={isPeak ? COLORS[metricKey] : "var(--chart-dim)"}
                opacity={dimmed ? 0.35 : 1}
                className="transition-opacity"
              />
              {/* Full-height invisible hit area so hovering is easy */}
              <rect
                x={x - gap / 2}
                y="0"
                width={barW + gap}
                height={H}
                fill="transparent"
                className="cursor-pointer"
                onMouseEnter={() => setHover(i)}
                onClick={() => {
                  if (d.item.permalink) window.open(d.item.permalink, "_blank", "noopener");
                }}
              />
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex items-center justify-between text-[10px] text-subtle">
        <span>{shortDate(data[0]?.item.timestamp, locale)}</span>
        <span className="text-subtle">
          {dict.avgPeak(metric.format(mean), metric.format(data[peakIdx]?.value ?? 0))}
        </span>
        <span>{shortDate(data[data.length - 1]?.item.timestamp, locale)}</span>
      </div>
    </div>
  );
}

/** Donut of how total engagement splits across likes / comments / saves / shares. */
function EngagementDonut({ items, dict }: { items: MediaItem[]; dict: Dict["myAccount"] }) {
  const [active, setActive] = useState<string | null>(null);

  const sumOf = (get: (m: MediaItem) => number) => items.reduce((a, m) => a + get(m), 0);
  const segments = [
    { label: dict.metrics.likes, value: sumOf((m) => m.insights?.likes ?? m.like_count ?? 0), color: COLORS.likes },
    { label: dict.metrics.comments, value: sumOf((m) => m.insights?.comments ?? m.comments_count ?? 0), color: COLORS.comments },
    { label: dict.metrics.saved, value: sumOf((m) => m.insights?.saved ?? 0), color: COLORS.saved },
    { label: dict.metrics.shares, value: sumOf((m) => m.insights?.shares ?? 0), color: COLORS.shares },
  ].filter((s) => s.value > 0);

  const sum = segments.reduce((a, s) => a + s.value, 0);
  const activeSeg = segments.find((s) => s.label === active) ?? null;
  const radius = 15.915; // circumference ≈ 100, so values map to % directly
  let offset = 25; // start at 12 o'clock

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative h-32 w-32 shrink-0">
        <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
          <circle cx="18" cy="18" r={radius} fill="none" stroke="var(--chart-grid)" strokeWidth="4" />
          {sum > 0 &&
            segments.map((s) => {
              const pct = (s.value / sum) * 100;
              const circle = (
                <circle
                  key={s.label}
                  cx="18"
                  cy="18"
                  r={radius}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={active === s.label ? 5 : 4}
                  strokeDasharray={`${pct} ${100 - pct}`}
                  strokeDashoffset={offset}
                  opacity={active != null && active !== s.label ? 0.3 : 1}
                  className="cursor-pointer transition-all"
                  onMouseEnter={() => setActive(s.label)}
                  onMouseLeave={() => setActive(null)}
                />
              );
              offset -= pct;
              return circle;
            })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-base font-semibold text-foreground">
            {formatCompact(activeSeg ? activeSeg.value : sum)}
          </span>
          <span className="text-[10px] text-subtle">
            {activeSeg ? activeSeg.label : dict.interactionsLabel}
          </span>
        </div>
      </div>
      <ul className="flex w-full flex-col gap-1.5">
        {segments.map((s) => (
          <li
            key={s.label}
            className={`flex cursor-default items-center justify-between gap-2 rounded-md px-1.5 py-0.5 text-xs transition-colors ${
              active === s.label ? "bg-secondary" : ""
            }`}
            onMouseEnter={() => setActive(s.label)}
            onMouseLeave={() => setActive(null)}
          >
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
              {s.label}
            </span>
            <span className="font-medium text-foreground">
              {formatCompact(s.value)}
              <span className="ms-1 text-subtle">
                {sum > 0 ? `${((s.value / sum) * 100).toFixed(0)}%` : "0%"}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Engagement rate (interactions ÷ views) per post over time, with hover dots. */
function EngagementRateLine({
  items,
  dict,
  locale,
}: {
  items: MediaItem[];
  dict: Dict["myAccount"];
  locale: Locale;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const data = items
    .map((m) => {
      const rate = engagementRateOf(m);
      return rate == null ? null : { rate, date: shortDate(m.timestamp, locale), item: m };
    })
    .filter((d): d is { rate: number; date: string; item: MediaItem } => d != null);

  if (data.length < 2) return null;

  const W = 100;
  const H = 40;
  const max = Math.max(...data.map((d) => d.rate));
  const min = Math.min(...data.map((d) => d.rate));
  const range = max - min || 1;
  const avgRate = data.reduce((a, d) => a + d.rate, 0) / data.length;

  const pts = data.map((d, i) => ({
    x: (i / (data.length - 1)) * W,
    y: H - ((d.rate - min) / range) * H * 0.9 - H * 0.05,
    ...d,
  }));

  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;

  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-xl font-semibold text-brand">{avgRate.toFixed(1)}%</span>
        <span className="text-xs text-subtle">{dict.avgEngagementRateLabel}</span>
        <span className="ms-auto text-[11px] text-subtle">
          {dict.bestWorst(max.toFixed(1), min.toFixed(1))}
        </span>
      </div>
      <div className="relative" onMouseLeave={() => setHover(null)}>
        {hover != null ? (
          <ChartTooltip leftPct={(pts[hover].x / W) * 100}>
            <p className="text-[10px] text-subtle">{pts[hover].date}</p>
            <p className="text-sm font-semibold text-brand">{pts[hover].rate.toFixed(2)}% ER</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {formatCompact(pts[hover].item.insights?.views)} {dict.metrics.views.toLowerCase()} ·{" "}
              {formatCompact(interactionsOf(pts[hover].item))} {dict.interactionsLabel}
            </p>
          </ChartTooltip>
        ) : null}
        <svg viewBox={`0 0 ${W} ${H}`} className="h-32 w-full" preserveAspectRatio="none">
          <defs>
            <linearGradient id="rateFill" x1="0" y1="0" x2="0" y2="1">
              {/* stop-color via style: var() in the presentation attribute is
                  flaky across browsers, but always resolves in CSS. */}
              <stop offset="0%" style={{ stopColor: COLORS.views }} stopOpacity="0.28" />
              <stop offset="100%" style={{ stopColor: COLORS.views }} stopOpacity="0" />
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
          {pts.map((p, i) => (
            <g key={i}>
              {hover === i ? (
                <>
                  <line x1={p.x} x2={p.x} y1="0" y2={H} stroke="var(--chart-grid)" strokeWidth="0.3" />
                  <circle cx={p.x} cy={p.y} r="1.4" fill={COLORS.views} />
                </>
              ) : null}
              <rect
                x={p.x - W / (data.length - 1) / 2}
                y="0"
                width={W / (data.length - 1)}
                height={H}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
              />
            </g>
          ))}
        </svg>
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-subtle">
        <span>{data[0].date}</span>
        <span>{data[data.length - 1].date}</span>
      </div>
    </div>
  );
}

/** Average views by weekday — when does this account perform best? */
function BestDayChart({
  items,
  dict,
  weekdays,
}: {
  items: MediaItem[];
  dict: Dict["myAccount"];
  weekdays: string[];
}) {
  const byDay: number[][] = Array.from({ length: 7 }, () => []);
  for (const m of items) {
    if (!m.timestamp) continue;
    // getDay(): 0=Sun … 6=Sat → remap so the chart reads Mon…Sun.
    const idx = (new Date(m.timestamp).getDay() + 6) % 7;
    byDay[idx].push(m.insights?.views ?? 0);
  }
  const avgs = byDay.map((v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0));
  const max = Math.max(1, ...avgs);
  const bestIdx = avgs.reduce((best, v, i) => (v > avgs[best] ? i : best), 0);

  if (avgs.every((v) => v === 0)) return null;

  return (
    <div>
      <div className="flex h-36 items-end gap-2">
        {avgs.map((v, i) => (
          <div key={weekdays[i]} className="group flex flex-1 flex-col items-center gap-1">
            <span
              className={`text-[10px] tabular-nums transition-opacity ${
                i === bestIdx ? "text-brand" : "text-subtle opacity-0 group-hover:opacity-100"
              }`}
            >
              {v > 0 ? formatCompact(Math.round(v)) : ""}
            </span>
            <div
              className={`w-full rounded-t-md transition-colors ${
                i === bestIdx ? "bg-primary" : "bg-border-strong group-hover:bg-border-strong"
              }`}
              style={{ height: `${Math.max((v / max) * 100, v > 0 ? 4 : 1)}%` }}
              title={dict.weekdayTooltip(weekdays[i], formatCompact(Math.round(v)), byDay[i].length)}
            />
            <span className={`text-[10px] ${i === bestIdx ? "font-semibold text-brand" : "text-subtle"}`}>
              {weekdays[i]}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-subtle">
        {dict.strongestDay(weekdays[bestIdx])}
      </p>
    </div>
  );
}

/** Top performers leaderboard with proportional bars. */
function TopPerformers({
  items,
  dict,
  locale,
}: {
  items: MediaItem[];
  dict: Dict["myAccount"];
  locale: Locale;
}) {
  const ranked = items
    .slice()
    .sort((a, b) => (b.insights?.views ?? 0) - (a.insights?.views ?? 0))
    .slice(0, 5);
  const max = Math.max(1, ranked[0]?.insights?.views ?? 0);

  if (ranked.length === 0) return null;

  return (
    <ol className="space-y-2">
      {ranked.map((m, i) => {
        const views = m.insights?.views ?? 0;
        const rate = engagementRateOf(m);
        return (
          <li key={m.id}>
            <a
              href={m.permalink}
              target="_blank"
              rel="noreferrer"
              className="group flex items-center gap-2.5 rounded-lg p-1.5 transition-colors hover:bg-secondary"
            >
              <span
                className={`w-4 shrink-0 text-center text-xs font-semibold ${
                  i === 0 ? "text-brand" : "text-subtle"
                }`}
              >
                {i + 1}
              </span>
              {m.thumbnail_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={m.thumbnail_url}
                  alt=""
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="h-9 w-9 shrink-0 rounded-md object-cover"
                />
              ) : (
                <span className="h-9 w-9 shrink-0 rounded-md bg-border" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-muted-foreground">
                  {m.caption?.replace(/\s+/g, " ") || shortDate(m.timestamp, locale) || dict.untitled}
                </p>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-border">
                  <div
                    className={`h-full rounded-full ${i === 0 ? "bg-primary" : "bg-border-strong group-hover:bg-border-strong"}`}
                    style={{ width: `${Math.max((views / max) * 100, 2)}%` }}
                  />
                </div>
              </div>
              <div className="shrink-0 text-end">
                <p className="text-xs font-semibold text-foreground">{formatCompact(views)}</p>
                <p className="text-[10px] text-subtle">
                  {rate != null ? `${rate.toFixed(1)}% ER` : dict.metrics.views.toLowerCase()}
                </p>
              </div>
            </a>
          </li>
        );
      })}
    </ol>
  );
}

export function InsightsCharts({ media, followers }: { media: MediaItem[]; followers?: number }) {
  const dict = useDict().myAccount;
  const locale = useLocale();
  const metrics = useMemo(() => buildMetrics(dict.metrics), [dict]);
  const ranges = useMemo(() => buildRanges(dict.ranges), [dict]);
  const weekdays = useMemo(() => weekdayLabels(intlLocale(locale)), [locale]);
  const [range, setRange] = useState<RangeKey>("all");
  const [metric, setMetric] = useState<MetricKey>("views");

  // Only posts Instagram returned insights for, oldest → newest for time trends.
  const analyzed = useMemo(
    () =>
      media
        .filter((m) => m.insights)
        .slice()
        .sort(
          (a, b) =>
            (a.timestamp ? new Date(a.timestamp).getTime() : 0) -
            (b.timestamp ? new Date(b.timestamp).getTime() : 0)
        ),
    [media]
  );

  const filtered = useMemo(() => {
    const days = ranges.find((r) => r.key === range)?.days;
    if (!days) return analyzed;
    // Anchor the window to the newest analyzed post (pure across re-renders,
    // and keeps ranges meaningful even when the last sync is a few days old).
    const newest = Math.max(
      ...analyzed.map((m) => (m.timestamp ? new Date(m.timestamp).getTime() : 0))
    );
    const cutoff = newest - days * 24 * 3600 * 1000;
    return analyzed.filter((m) => m.timestamp && new Date(m.timestamp).getTime() >= cutoff);
  }, [analyzed, range, ranges]);

  if (analyzed.length === 0) return null;

  // KPIs over the filtered window.
  const viewsSeries = filtered.map((m) => m.insights?.views ?? 0);
  const totalViews = viewsSeries.reduce((a, b) => a + b, 0);
  const avgViews = filtered.length ? totalViews / filtered.length : 0;
  const totalInteractions = filtered.reduce((a, m) => a + interactionsOf(m), 0);
  const engagementRate = totalViews > 0 ? (totalInteractions / totalViews) * 100 : null;
  const rateSeries = filtered
    .map((m) => engagementRateOf(m))
    .filter((v): v is number => v != null);
  const watchTimes = filtered
    .map((m) => m.insights?.avg_watch_time_ms)
    .filter((v): v is number => v != null);
  const avgWatch = watchTimes.length
    ? watchTimes.reduce((a, b) => a + b, 0) / watchTimes.length
    : null;

  // Some metrics only exist on part of the data — hide their tabs when empty.
  const availableMetrics = metrics.filter((m) => filtered.some((item) => (m.get(item) ?? 0) > 0));

  return (
    <div className="space-y-4">
      {/* Range filter */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <Activity className="h-4 w-4 text-brand" />
          {dict.performanceAnalytics}
        </h3>
        <div className="flex items-center gap-1.5">
          {ranges.map((r) => (
            <Pill key={r.key} active={range === r.key} onClick={() => setRange(r.key)}>
              {r.label}
            </Pill>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border-strong p-4 text-center text-sm text-muted-foreground">
          {dict.noAnalyzedPosts}
        </p>
      ) : (
        <>
          {/* KPI strip with half-over-half trend deltas */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard
              label={dict.avgViewsPerPost}
              value={formatCompact(Math.round(avgViews))}
              delta={halfOverHalfDelta(viewsSeries)}
              icon={<Eye className="h-3.5 w-3.5" />}
            />
            <KpiCard
              label={dict.engagementRate}
              value={engagementRate != null ? `${engagementRate.toFixed(1)}%` : "—"}
              delta={halfOverHalfDelta(rateSeries)}
              icon={<Heart className="h-3.5 w-3.5" />}
            />
            <KpiCard
              label={dict.avgWatchTime}
              value={avgWatch != null ? `${(avgWatch / 1000).toFixed(1)}s` : "—"}
              icon={<Clock className="h-3.5 w-3.5" />}
            />
            <KpiCard
              label={followers ? dict.viewsVsFollowers : dict.postsAnalyzed}
              value={
                followers
                  ? `${((avgViews / followers) * 100).toFixed(1)}%`
                  : String(filtered.length)
              }
              icon={<Users className="h-3.5 w-3.5" />}
            />
          </div>

          {/* Main metric chart with switcher */}
          <ChartCard
            title={dict.perPostPerformance}
            icon={<BarChart3 className="h-4 w-4" />}
            hint={dict.hoverBarHint}
            actions={
              <div className="flex max-w-full items-center gap-1.5 overflow-x-auto pb-0.5">
                {availableMetrics.map((m) => (
                  <Pill key={m.key} active={metric === m.key} onClick={() => setMetric(m.key)}>
                    {m.icon}
                    {m.label}
                  </Pill>
                ))}
              </div>
            }
          >
            <MetricBarChart
              items={filtered}
              metricKey={availableMetrics.some((m) => m.key === metric) ? metric : "views"}
              metrics={metrics}
              dict={dict}
              locale={locale}
            />
          </ChartCard>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title={dict.engagementMix} icon={<PieChart className="h-4 w-4" />}>
              <EngagementDonut items={filtered} dict={dict} />
            </ChartCard>
            <ChartCard
              title={dict.bestDayToPost}
              icon={<CalendarDays className="h-4 w-4" />}
              hint={dict.avgViewsByWeekdayHint}
            >
              <BestDayChart items={filtered} dict={dict} weekdays={weekdays} />
            </ChartCard>
          </div>

          {filtered.length >= 2 ? (
            <ChartCard
              title={dict.engagementRateTrend}
              icon={<LineChartIcon className="h-4 w-4" />}
              hint={dict.interactionsPerViewsHint}
            >
              <EngagementRateLine items={filtered} dict={dict} locale={locale} />
            </ChartCard>
          ) : null}

          <ChartCard
            title={dict.topPerformers}
            icon={<Trophy className="h-4 w-4" />}
            hint={dict.byViewsHint}
          >
            <TopPerformers items={filtered} dict={dict} locale={locale} />
          </ChartCard>
        </>
      )}
    </div>
  );
}
