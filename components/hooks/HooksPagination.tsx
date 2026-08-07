"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useDict } from "@/lib/i18n/I18nProvider";

type HooksPaginationProps = {
  page: number;
  totalPages: number;
  total: number;
  perPage: number;
  onPageChange: (page: number) => void;
};

// Client-side pagination for the hooks page lists: unlike FeedPagination
// (URL-driven, server-paginated) these lists are fully loaded up front and
// filtered/searched in-memory, so paging here just slices the already-
// filtered array — no navigation, no server round-trip.
export function HooksPagination({ page, totalPages, total, perPage, onPageChange }: HooksPaginationProps) {
  const dict = useDict().hooks.pagination;

  if (total === 0 || totalPages <= 1) return null;

  const from = (page - 1) * perPage + 1;
  const toShown = Math.min(page * perPage, total);

  const pages: number[] = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, page + 2);
  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
      <p className="text-xs text-subtle">{dict.showing(from, toShown, total)}</p>

      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border-strong bg-surface-2 text-muted-foreground transition hover:border-accent-brand/60 hover:text-accent-brand disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={dict.previousAria}
        >
          <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
        </button>

        {start > 1 ? (
          <>
            <PageButton n={1} current={page} onClick={onPageChange} />
            {start > 2 ? <span className="px-1 text-subtle">…</span> : null}
          </>
        ) : null}

        {pages.map((n) => (
          <PageButton key={n} n={n} current={page} onClick={onPageChange} />
        ))}

        {end < totalPages ? (
          <>
            {end < totalPages - 1 ? <span className="px-1 text-subtle">…</span> : null}
            <PageButton n={totalPages} current={page} onClick={onPageChange} />
          </>
        ) : null}

        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border-strong bg-surface-2 text-muted-foreground transition hover:border-accent-brand/60 hover:text-accent-brand disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={dict.nextAria}
        >
          <ChevronRight className="h-4 w-4 rtl:rotate-180" />
        </button>
      </div>
    </div>
  );
}

function PageButton({ n, current, onClick }: { n: number; current: number; onClick: (n: number) => void }) {
  const active = n === current;
  return (
    <button
      type="button"
      disabled={active}
      onClick={() => onClick(n)}
      className={
        active
          ? "h-8 min-w-8 rounded-lg bg-accent-brand px-2 text-sm font-semibold text-accent-brand-foreground"
          : "h-8 min-w-8 rounded-lg border border-border-strong bg-surface-2 px-2 text-sm text-muted-foreground transition hover:border-accent-brand/60 hover:text-accent-brand disabled:opacity-40"
      }
    >
      {n}
    </button>
  );
}
