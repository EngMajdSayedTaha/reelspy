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
  Trophy,
  Users,
} from "lucide-react";
import {
  ChartCard,
  ChartTooltip,
  KpiCard,
  Pill,
} from "@/components/charts/primitives";
import { SeriesBarChart } from "@/components/charts/SeriesBarChart";
import { Leaderboard, type LeaderboardEntry } from "@/components/charts/Leaderboard";
import { WeekdayBars } from "@/components/charts/WeekdayBars";
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
  const metric = metrics.find((m) => m.key === metricKey)!;

  const data = items.map((m) => ({ item: m, value: metric.get(m) ?? 0 }));
  const mean = data.length ? data.reduce((a, d) => a + d.value, 0) / data.length : 0;
  const peak = data.reduce((best, d) => (d.value > best ? d.value : best), 0);

  return (
    <SeriesBarChart
      points={data.map((d) => ({ id: d.item.id, value: d.value, href: d.item.permalink }))}
      color={COLORS[metricKey]}
      startLabel={shortDate(data[0]?.item.timestamp, locale)}
      endLabel={shortDate(data[data.length - 1]?.item.timestamp, locale)}
      centerLabel={dict.avgPeak(metric.format(mean), metric.format(peak))}
      renderTooltip={(_point, i) => (
        <>
          <p className="text-[10px] text-subtle">
            {shortDate(data[i].item.timestamp, locale)} ·{" "}
            {String(data[i].item.media_product_type ?? data[i].item.media_type ?? "post").toLowerCase()}
          </p>
          <p className="text-sm font-semibold" style={{ color: COLORS[metricKey] }}>
            {metric.format(data[i].value)} {metric.label.toLowerCase()}
          </p>
          <p className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-0.5">
              <Heart className="h-2.5 w-2.5" />
              {formatCompact(data[i].item.insights?.likes ?? data[i].item.like_count)}
            </span>
            <span className="flex items-center gap-0.5">
              <MessageCircle className="h-2.5 w-2.5" />
              {formatCompact(data[i].item.insights?.comments ?? data[i].item.comments_count)}
            </span>
            {engagementRateOf(data[i].item) != null ? (
              <span>{engagementRateOf(data[i].item)!.toFixed(1)}% ER</span>
            ) : null}
          </p>
          {data[i].item.caption ? (
            <p className="mt-1 line-clamp-2 text-[10px] text-subtle">{data[i].item.caption}</p>
          ) : null}
        </>
      )}
    />
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

  return (
    <WeekdayBars
      values={avgs}
      counts={byDay.map((v) => v.length)}
      labels={weekdays}
      format={(v) => formatCompact(Math.round(v))}
      tooltip={(label, value, count) => dict.weekdayTooltip(label, value, count)}
      footnote={(best) => dict.strongestDay(weekdays[best])}
    />
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
  const entries: LeaderboardEntry[] = items
    .slice()
    .sort((a, b) => (b.insights?.views ?? 0) - (a.insights?.views ?? 0))
    .slice(0, 5)
    .map((m) => {
      const views = m.insights?.views ?? 0;
      const rate = engagementRateOf(m);
      return {
        id: m.id,
        title: m.caption?.replace(/\s+/g, " ") || shortDate(m.timestamp, locale) || dict.untitled,
        thumbnail: m.thumbnail_url,
        value: views,
        valueLabel: formatCompact(views),
        subLabel: rate != null ? `${rate.toFixed(1)}% ER` : dict.metrics.views.toLowerCase(),
        href: m.permalink,
      };
    });

  return <Leaderboard entries={entries} />;
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
