"use client";

import { TrendingUp } from "lucide-react";
import { ChartCard, DeltaBadge } from "@/components/charts/primitives";
import { Sparkline } from "@/components/charts/Sparkline";
import { useDict, useLocale } from "@/lib/i18n/I18nProvider";
import { formatCompact } from "@/lib/instagram/insights-export";
import { formatShortDay } from "@/components/accounts/detail/format";
import type { MetricHistoryPoint } from "@/lib/accounts/detail";

/**
 * Follower growth, which only exists because `ig_account_metric_history`
 * records one row per account per UTC day. Before that table there was no
 * time-series data anywhere in the product — every sync overwrote the follower
 * count in place — so this chart necessarily starts empty for an account and
 * fills in from the first sync onward.
 *
 * That makes the degraded states the important part of this component, not the
 * chart: an empty axis would read as "this account isn't growing" rather than
 * "we haven't watched it long enough yet".
 */
export function FollowerHistoryCard({
  history,
  currentFollowers,
}: {
  history: MetricHistoryPoint[];
  currentFollowers: number | null;
}) {
  const dict = useDict();
  const locale = useLocale();
  const t = dict.accounts.detail.performance;

  const points = history.filter((p) => p.followers != null) as { on: string; followers: number }[];

  if (points.length < 2) {
    return (
      <ChartCard title={t.growth} icon={<TrendingUp className="h-4 w-4" />} hint={t.growthHint}>
        <p className="text-2xl font-semibold text-foreground">
          {currentFollowers != null ? formatCompact(currentFollowers) : "—"}
        </p>
        <p className="mt-1.5 text-xs text-muted-foreground">{t.growthStarting}</p>
      </ChartCard>
    );
  }

  const first = points[0];
  const last = points[points.length - 1];
  const gained = last.followers - first.followers;
  const days = Math.max(
    1,
    Math.round((new Date(last.on).getTime() - new Date(first.on).getTime()) / 86_400_000)
  );
  const deltaPct = first.followers > 0 ? (gained / first.followers) * 100 : null;

  return (
    <ChartCard
      title={t.growth}
      icon={<TrendingUp className="h-4 w-4" />}
      hint={t.growthHint}
      actions={<DeltaBadge delta={deltaPct} />}
    >
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-2xl font-semibold text-foreground">
          {formatCompact(last.followers)}
        </span>
        <span className="text-xs text-subtle">
          {t.growthDelta(`${gained >= 0 ? "+" : ""}${formatCompact(gained)}`, days)}
        </span>
      </div>

      <Sparkline gradientId="followerGrowthFill" values={points.map((p) => p.followers)} />

      <div className="mt-1 flex justify-between text-[10px] text-subtle">
        <span>{formatShortDay(first.on, locale)}</span>
        <span>{formatShortDay(last.on, locale)}</span>
      </div>
    </ChartCard>
  );
}
