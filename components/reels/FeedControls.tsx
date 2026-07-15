"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDownWideNarrow, ArrowUpWideNarrow, Loader2, Search, X } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useDict } from "@/lib/i18n/I18nProvider";

type Account = { id: string; ig_username: string };
type Group = { id: string; name: string };

type FeedControlsProps = {
  accounts: Account[];
  groups: Group[];
  current: {
    account: string;
    group: string;
    status: string;
    q: string;
    sort: string;
    order: string;
    perPage: string;
  };
  statusCounts: Record<string, number>;
  total: number;
};

const SORT_VALUES = ["outperforming", "recent", "views", "likes", "comments", "viral"] as const;
const STATUS_VALUES = ["new", "all", "worked", "favorites", "discarded"] as const;
const PER_PAGE_OPTIONS = ["10", "25"];

const selectClass =
  "h-9 w-full rounded-lg border border-border-strong bg-surface-2 px-3 text-base text-foreground outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20 sm:w-auto md:text-sm";

export function FeedControls({ accounts, groups, current, statusCounts, total }: FeedControlsProps) {
  const fullDict = useDict();
  const dict = fullDict.feed.controls;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(current.q);
  const [syncedQ, setSyncedQ] = useState(current.q);

  // Keep the input in sync when navigation changes the query externally
  // (e.g. browser back, Clear button) — adjust state during render, no effect.
  if (current.q !== syncedQ) {
    setSyncedQ(current.q);
    setSearch(current.q);
  }

  function apply(updates: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "" || value === "all") {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    }
    // Any filter/sort change resets pagination.
    next.delete("page");
    startTransition(() => {
      router.push(`${pathname}?${next.toString()}`);
    });
  }

  function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    apply({ q: search.trim() });
  }

  const isFiltered =
    current.account !== "all" ||
    current.group !== "all" ||
    current.status !== "new" ||
    current.q !== "";

  return (
    <div className="relative rounded-xl border border-border bg-card p-3">
      {/* Thin progress bar while the filtered feed is loading. Rounded ends
          stand in for the parent's old overflow-hidden, which clipped the
          account dropdown panel. */}
      {isPending ? (
        <span className="absolute inset-x-2 top-0 h-0.5 animate-pulse rounded-full bg-primary" />
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <form onSubmit={onSearchSubmit} className="flex w-full gap-2 sm:w-auto sm:min-w-[230px] sm:flex-1">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={dict.searchPlaceholder}
              className="h-9 w-full rounded-lg border border-border-strong bg-surface-2 ps-9 pe-3 text-base md:text-sm text-foreground placeholder:text-subtle outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:bg-primary-hover disabled:opacity-60"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            {isPending ? dict.searching : fullDict.common.search}
          </button>
        </form>

        {/* On phones the filters form a 2-column grid; from `sm` up the
            wrapper dissolves (display: contents) into the flex-wrap row. */}
        <div className="grid grid-cols-2 gap-2 sm:contents">
        <SearchableSelect
          ariaLabel={dict.filterByAccountAria}
          className="w-full sm:w-44"
          value={current.account}
          onChange={(value) => apply({ account: value })}
          allOption={{ value: "all", label: dict.allAccountsOption }}
          options={accounts.map((a) => ({ value: a.id, label: `@${a.ig_username}` }))}
          placeholder={dict.searchAccountsPlaceholder}
        />

        {groups.length > 0 ? (
          <select
            aria-label={dict.filterByGroupAria}
            className={selectClass}
            value={current.group}
            onChange={(e) => apply({ group: e.target.value })}
          >
            <option value="all">{dict.allGroupsOption}</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        ) : null}

        <select
          aria-label={dict.filterByStatusAria}
          className={selectClass}
          value={current.status}
          onChange={(e) => apply({ status: e.target.value })}
        >
          {STATUS_VALUES.map((value) => (
            <option key={value} value={value}>
              {dict.statusOptions[value]} ({statusCounts[value] ?? 0})
            </option>
          ))}
        </select>

        {/* Sort + direction share one grid cell on phones. */}
        <div className="flex gap-2 sm:contents">
          <select
            aria-label={dict.sortByAria}
            className={selectClass}
            value={current.sort}
            onChange={(e) => apply({ sort: e.target.value })}
          >
            {SORT_VALUES.map((value) => (
              <option key={value} value={value}>
                {dict.sortOptions[value]}
              </option>
            ))}
          </select>

          <button
            type="button"
            aria-label={dict.toggleSortDirectionAria}
            title={current.order === "asc" ? dict.ascendingTitle : dict.descendingTitle}
            onClick={() => apply({ order: current.order === "asc" ? "desc" : "asc" })}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border-strong bg-surface-2 text-muted-foreground transition hover:border-accent-brand/60 hover:text-accent-brand"
          >
            {current.order === "asc" ? (
              <ArrowUpWideNarrow className="h-4 w-4" />
            ) : (
              <ArrowDownWideNarrow className="h-4 w-4" />
            )}
          </button>
        </div>

        <select
          aria-label={dict.perPageAria}
          className={selectClass}
          value={current.perPage}
          // Always set pp explicitly: the page-level default comes from the
          // user's saved preference now, so "no param" no longer means 10.
          onChange={(e) => apply({ pp: e.target.value })}
        >
          {PER_PAGE_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {dict.perPageOption(n)}
            </option>
          ))}
        </select>

        {isFiltered ? (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              apply({ account: null, group: null, status: null, q: null });
            }}
            className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border-strong bg-surface-2 px-3 text-sm text-muted-foreground transition hover:border-danger/50 hover:text-danger"
          >
            <X className="h-3.5 w-3.5" />
            {dict.clearButton}
          </button>
        ) : null}
        </div>
      </div>

      <p className="mt-2 px-1 text-xs text-subtle">
        {dict.reelsCount(total)}
        {isFiltered ? dict.matchesFiltersSuffix : dict.trackedSuffix}
      </p>
    </div>
  );
}
