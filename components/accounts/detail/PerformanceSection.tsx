"use client";

import { BarChart3, Gauge, Scale } from "lucide-react";
import { ChartCard, DeltaBadge } from "@/components/charts/primitives";
import { SeriesBarChart } from "@/components/charts/SeriesBarChart";
import { Histogram } from "@/components/charts/Histogram";
import { useDict, useLocale } from "@/lib/i18n/I18nProvider";
import { formatCompact } from "@/lib/instagram/insights-export";
import { formatShortDay } from "@/components/accounts/detail/format";
import type { DistributionSummary, MatureTrend, TimelinePoint } from "@/lib/accounts/metrics";

export function PerformanceSection({
  timeline,
  distribution,
  trend,
  medianViews,
  p90Views,
}: {
  timeline: TimelinePoint[];
  distribution: DistributionSummary;
  trend: MatureTrend;
  medianViews: number | null;
  p90Views: number | null;
}) {
  const dict = useDict();
  const locale = useLocale();
  const t = dict.accounts.detail.performance;

  const bucketIndexOf = (value: number | null) =>
    value == null ? -1 : distribution.buckets.findIndex((b) => value >= b.from && value < b.to);
  const medianIdx = bucketIndexOf(medianViews);
  const p90Idx = bucketIndexOf(p90Views);

  const buckets = distribution.buckets.map((bucket, i) => ({
    label: bucket.label,
    count: bucket.count,
    marker:
      i === medianIdx
        ? dict.accounts.detail.kpi.medianViews
        : i === p90Idx
          ? "P90"
          : null,
  }));

  return (
    <div className="space-y-4">
      {timeline.length > 1 ? (
        <ChartCard title={t.timeline} icon={<BarChart3 className="h-4 w-4" />} hint={t.timelineHint}>
          <SeriesBarChart
            points={timeline}
            color="var(--chart-1)"
            startLabel={formatShortDay(timeline[0]?.at, locale)}
            endLabel={formatShortDay(timeline[timeline.length - 1]?.at, locale)}
            centerLabel={t.postsCount(timeline.length)}
            renderTooltip={(_point, i) => (
              <>
                <p className="text-[10px] text-subtle">{formatShortDay(timeline[i].at, locale)}</p>
                <p className="text-sm font-semibold text-brand">
                  {formatCompact(timeline[i].value)}
                </p>
              </>
            )}
          />
        </ChartCard>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title={t.distribution}
          icon={<Scale className="h-4 w-4" />}
          hint={t.distributionHint}
        >
          <Histogram buckets={buckets} emptyLabel={dict.accounts.detail.empty.tooFew} />
        </ChartCard>

        <ChartCard
          title={t.trend}
          icon={<Gauge className="h-4 w-4" />}
          hint={t.trendHint}
          actions={<DeltaBadge delta={trend.deltaPct} />}
        >
          {trend.deltaPct == null ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t.trendInsufficient}</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Window
                label={t.recentWindow}
                value={formatCompact(Math.round(trend.recentMedian ?? 0))}
                sub={t.postsCount(trend.recentCount)}
                highlight
              />
              <Window
                label={t.priorWindow}
                value={formatCompact(Math.round(trend.priorMedian ?? 0))}
                sub={t.postsCount(trend.priorCount)}
              />
            </div>
          )}
          {/* The caveat is the point: without it this chart is the most
              commonly wrong number in tools like this. */}
          <p className="mt-3 text-[11px] leading-relaxed text-subtle">{t.trendExplainer}</p>
        </ChartCard>
      </div>
    </div>
  );
}

function Window({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub: string;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-lg p-3 ${highlight ? "bg-secondary" : "bg-background"}`}>
      <p className="text-[11px] text-subtle">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${highlight ? "text-brand" : "text-foreground"}`}>
        {value}
      </p>
      <p className="text-[10px] text-subtle">{sub}</p>
    </div>
  );
}
