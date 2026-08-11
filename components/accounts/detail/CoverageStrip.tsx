"use client";

import { Archive, CalendarRange, Film, Info } from "lucide-react";
import { useDict, useLocale } from "@/lib/i18n/I18nProvider";
import { formatCompact } from "@/lib/instagram/insights-export";
import { formatDay } from "@/components/accounts/detail/format";
import type { ArchiveStatus } from "@/lib/instagram/archive-status";
import type { AccountAggregates } from "@/lib/accounts/detail";

/**
 * What this page actually knows about the account, stated before any chart —
 * so a number computed over 40 recent reels is never mistaken for a number
 * computed over the account's whole life.
 */
export function CoverageStrip({
  aggregates,
  archive,
}: {
  aggregates: AccountAggregates;
  archive: ArchiveStatus | null;
}) {
  const dict = useDict();
  const locale = useLocale();
  const t = dict.accounts.detail;

  // The shared snapshot cache can reach further back than this user's own feed
  // when someone else paid to archive the same account — worth surfacing,
  // because one click materializes it.
  const deeperAvailable =
    archive?.oldestSeenAt != null &&
    aggregates.firstPostedAt != null &&
    new Date(archive.oldestSeenAt).getTime() < new Date(aggregates.firstPostedAt).getTime();

  const depth = archive?.exhausted
    ? t.coverage.fullHistory
    : deeperAvailable
      ? t.coverage.deeperAvailable
      : // `requested` means THIS user actually pulled a bounded archive — the
        // account can hold hundreds of reels across a full year without ever
        // being `exhausted` (the walk just never asked to go back further than
        // that). Only fall back to "recent reels only" when no archive was
        // requested at all, i.e. what's here is whatever a normal sync grabbed.
        archive?.requested
        ? t.coverage.extendedHistory
        : t.coverage.partialHistory;

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-border bg-card px-4 py-3 text-sm">
      <Fact icon={<Film className="h-4 w-4" />} label={t.coverage.reelsTracked}>
        {formatCompact(aggregates.reelsTotal)}
        {!aggregates.exact ? (
          <span
            title={t.approximateHint}
            className="ms-1.5 inline-flex items-center gap-1 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
          >
            <Info className="h-2.5 w-2.5" />
            {t.approximate}
          </span>
        ) : null}
      </Fact>

      <Fact icon={<CalendarRange className="h-4 w-4" />} label={t.coverage.range}>
        {t.coverage.rangeValue(
          formatDay(aggregates.firstPostedAt, locale),
          formatDay(aggregates.lastPostedAt, locale)
        )}
      </Fact>

      <Fact icon={<Archive className="h-4 w-4" />} label={t.coverage.history}>
        {depth}
      </Fact>
    </div>
  );
}

function Fact({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="text-subtle">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-subtle">{label}</p>
        <p className="truncate font-medium text-foreground">{children}</p>
      </div>
    </div>
  );
}
