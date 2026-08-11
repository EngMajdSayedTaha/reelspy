"use client";

import { CalendarClock, Eye, Heart, MessageCircle, Trophy, Users } from "lucide-react";
import { KpiCard } from "@/components/charts/primitives";
import { useDict } from "@/lib/i18n/I18nProvider";
import { formatCompact } from "@/lib/instagram/insights-export";
import { formatDecimal, formatPercent } from "@/components/accounts/detail/format";
import type { CadenceSummary, DistributionSummary, EngagementSummary } from "@/lib/accounts/metrics";
import type { AccountAggregates } from "@/lib/accounts/detail";

/**
 * The six numbers a social-media manager reads first.
 *
 * Median leads, average follows underneath it — the gap between them is the
 * signal the "best vs typical" card then quantifies.
 */
export function AccountKpis({
  aggregates,
  engagement,
  distribution,
  cadence,
  followers,
  trendDelta,
}: {
  aggregates: AccountAggregates;
  engagement: EngagementSummary;
  distribution: DistributionSummary;
  cadence: CadenceSummary;
  followers: number | null;
  /** Mature-window percentage change, or null when there isn't enough history. */
  trendDelta: number | null;
}) {
  const dict = useDict().accounts.detail;
  const t = dict.kpi;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <KpiCard
        label={t.medianViews}
        hint={t.medianViewsHint}
        icon={<Eye className="h-3.5 w-3.5" />}
        value={aggregates.viewsMedian != null ? formatCompact(Math.round(aggregates.viewsMedian)) : "—"}
        delta={trendDelta}
        footnote={
          aggregates.viewsAvg != null
            ? `${t.avgViews}: ${formatCompact(Math.round(aggregates.viewsAvg))}`
            : undefined
        }
      />

      <KpiCard
        label={t.engagementRate}
        hint={t.engagementRateHint}
        icon={<Heart className="h-3.5 w-3.5" />}
        value={formatPercent(engagement.rateByViews)}
        footnote={
          engagement.rateByFollowers != null
            ? `${t.byFollowers}: ${formatPercent(engagement.rateByFollowers)}`
            : undefined
        }
      />

      <KpiCard
        label={t.perFollower}
        hint={t.perFollowerHint}
        icon={<Users className="h-3.5 w-3.5" />}
        value={
          engagement.viewsPerFollower != null ? t.times(formatDecimal(engagement.viewsPerFollower, 2)) : "—"
        }
        footnote={followers ? `${t.followers}: ${formatCompact(followers)}` : undefined}
      />

      <KpiCard
        label={t.outlier}
        hint={t.outlierHint}
        icon={<Trophy className="h-3.5 w-3.5" />}
        value={distribution.outlierRatio != null ? t.times(formatDecimal(distribution.outlierRatio)) : "—"}
        footnote={
          distribution.hitRate != null
            ? `${t.hitRate}: ${formatPercent(distribution.hitRate * 100, 0)}`
            : undefined
        }
      />

      <KpiCard
        label={t.commentShare}
        hint={t.commentShareHint}
        icon={<MessageCircle className="h-3.5 w-3.5" />}
        value={formatPercent(engagement.commentShare)}
        footnote={t.commentsOfInteractions(
          formatCompact(aggregates.commentsTotal),
          formatCompact(aggregates.likesTotal + aggregates.commentsTotal)
        )}
      />

      <KpiCard
        label={t.postsPerWeek}
        icon={<CalendarClock className="h-3.5 w-3.5" />}
        value={formatDecimal(cadence.postsPerWeek)}
        footnote={
          cadence.medianGapDays != null
            ? `${dict.patterns.medianGap}: ${dict.patterns.days(formatDecimal(cadence.medianGapDays))}`
            : undefined
        }
      />
    </div>
  );
}
