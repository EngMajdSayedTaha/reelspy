"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { CalendarDays, Clock, Repeat } from "lucide-react";
import { ChartCard, Pill } from "@/components/charts/primitives";
import { WeekdayBars } from "@/components/charts/WeekdayBars";
import { HourWeekdayHeatmap } from "@/components/charts/HourWeekdayHeatmap";
import { useDict, useLocale } from "@/lib/i18n/I18nProvider";
import { intlLocale } from "@/lib/i18n/intl";
import { formatCompact } from "@/lib/instagram/insights-export";
import { formatDecimal } from "@/components/accounts/detail/format";
import { hourWeekdayGrid, weekdayMedians, type CadenceSummary, type TimePoint } from "@/lib/accounts/metrics";

/** Minimum posts before a weekday counts as a pattern rather than an accident. */
const MIN_WEEKDAY_SAMPLE = 3;

// `false` during SSR and the hydrating render, `true` afterwards — the standard
// useSyncExternalStore shape for "is this the browser yet". Preferred over a
// setState-in-effect flag: no cascading render, and React guarantees the server
// snapshot is what hydration compares against.
const NOOP_SUBSCRIBE = () => () => {};
const useHydrated = () =>
  useSyncExternalStore(
    NOOP_SUBSCRIBE,
    () => true,
    () => false
  );

/** Locale-correct Mon…Sun labels. Jan 5 2026 is a Monday, used as an anchor. */
function weekdayLabels(locale: string): string[] {
  const fmt = new Intl.DateTimeFormat(locale, { weekday: "short" });
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2026, 0, 5 + i)));
}

export function PostingPatterns({
  points,
  cadence,
}: {
  /** `[epochMs, views]` pairs — compact enough to re-bucket on the client. */
  points: TimePoint[];
  cadence: CadenceSummary;
}) {
  const dict = useDict();
  const locale = useLocale();
  const t = dict.accounts.detail.patterns;

  // Bucketing by hour-of-day is the one thing on this page that genuinely
  // depends on the viewer's timezone — and the server has a different one, so
  // rendering local time directly would be a hydration mismatch. The first
  // paint is therefore UTC (identical on both sides) and it switches to local
  // once mounted. The toggle makes the switch legible instead of mysterious.
  const hydrated = useHydrated();
  const [preferLocal, setPreferLocal] = useState(true);
  const utc = !hydrated || !preferLocal;

  const labels = useMemo(() => weekdayLabels(intlLocale(locale)), [locale]);
  const weekday = useMemo(() => weekdayMedians(points, utc), [points, utc]);
  const grid = useMemo(() => hourWeekdayGrid(points, utc), [points, utc]);

  const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")}`;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title={t.bestDay} icon={<CalendarDays className="h-4 w-4" />} hint={t.bestDayHint}>
          <WeekdayBars
            values={weekday.values}
            counts={weekday.counts}
            labels={labels}
            minSample={MIN_WEEKDAY_SAMPLE}
            format={(v) => formatCompact(Math.round(v))}
            tooltip={(day, value, count) => t.weekdayTooltip(day, value, count)}
            footnote={(best) => t.strongestDay(labels[best])}
          />
        </ChartCard>

        <ChartCard
          title={t.heatmap}
          icon={<Clock className="h-4 w-4" />}
          hint={t.heatmapHint}
          actions={
            <div className="flex items-center gap-1.5">
              <Pill active={!utc} onClick={() => setPreferLocal(true)}>
                {t.timezoneLocal}
              </Pill>
              <Pill active={utc} onClick={() => setPreferLocal(false)}>
                {t.timezoneUtc}
              </Pill>
            </div>
          }
        >
          <HourWeekdayHeatmap
            cells={grid}
            dayLabels={labels}
            hourLabel={hourLabel}
            cellTitle={(cell, day, hour) =>
              t.heatmapCell(day, hour, formatCompact(Math.round(cell.value)), cell.count)
            }
          />
          {/* Says out loud what the grid cannot: this is when *they* post, in
              *your* timezone — not advice about when you should post. */}
          <p className="mt-3 text-[11px] leading-relaxed text-subtle">{t.timezoneNote}</p>
        </ChartCard>
      </div>

      <ChartCard title={t.cadence} icon={<Repeat className="h-4 w-4" />}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Fact label={t.postsPerWeek} value={formatDecimal(cadence.postsPerWeek)} />
          <Fact
            label={t.medianGap}
            value={
              cadence.medianGapDays != null ? t.days(formatDecimal(cadence.medianGapDays)) : "—"
            }
          />
          <Fact
            label={t.longestGap}
            value={
              cadence.longestGapDays != null ? t.days(formatDecimal(cadence.longestGapDays, 0)) : "—"
            }
          />
          <Fact
            label={t.sinceLast}
            value={
              cadence.daysSinceLastPost != null
                ? t.days(formatDecimal(cadence.daysSinceLastPost, 0))
                : "—"
            }
            warn={cadence.daysSinceLastPost != null && cadence.daysSinceLastPost > 30}
            warnLabel={t.dormant}
            warnHint={t.dormantHint}
          />
        </div>
        <p className="mt-3 text-[11px] text-subtle">
          {t.streak}: {t.streakValue(cadence.activeWeeks, cadence.weeksTracked)}
        </p>
      </ChartCard>
    </div>
  );
}

function Fact({
  label,
  value,
  warn,
  warnLabel,
  warnHint,
}: {
  label: string;
  value: string;
  warn?: boolean;
  warnLabel?: string;
  warnHint?: string;
}) {
  return (
    <div className="rounded-lg bg-background p-3">
      <p className="text-[11px] text-subtle">{label}</p>
      <p className="mt-1 text-base font-semibold text-foreground">{value}</p>
      {warn && warnLabel ? (
        <span
          title={warnHint}
          className="mt-1 inline-block rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-warning"
        >
          {warnLabel}
        </span>
      ) : null}
    </div>
  );
}
