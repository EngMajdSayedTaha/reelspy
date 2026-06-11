"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDownWideNarrow, ArrowUpWideNarrow, Loader2, Search, X } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { VIRAL_PATTERNS } from "@/lib/viral-patterns";

type Account = { id: string; ig_username: string };
type Group = { id: string; name: string };

type FeedControlsProps = {
  accounts: Account[];
  groups: Group[];
  current: {
    account: string;
    group: string;
    pattern: string;
    status: string;
    q: string;
    sort: string;
    order: string;
    perPage: string;
  };
  statusCounts: Record<string, number>;
  total: number;
};

const SORT_OPTIONS = [
  { value: "recent", label: "Newest" },
  { value: "views", label: "Most viewed" },
  { value: "likes", label: "Most liked" },
  { value: "comments", label: "Most comments" },
  { value: "viral", label: "Viral score" },
];

const STATUS_OPTIONS = [
  { value: "new", label: "New only" },
  { value: "all", label: "All reels" },
  { value: "worked", label: "Worked on" },
  { value: "favorites", label: "Favorites" },
  { value: "discarded", label: "Discarded" },
];

const PER_PAGE_OPTIONS = ["10", "25"];

const selectClass =
  "h-9 rounded-lg border border-[#262626] bg-[#141414] px-3 text-sm text-zinc-200 outline-none transition focus:border-[#F9E400]/60 focus:ring-2 focus:ring-[#F9E400]/20";

export function FeedControls({ accounts, groups, current, statusCounts, total }: FeedControlsProps) {
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
    current.pattern !== "all" ||
    current.status !== "new" ||
    current.q !== "";

  return (
    <div className="relative overflow-hidden rounded-xl border border-[#1f1f1f] bg-[#111111] p-3">
      {/* Thin progress bar while the filtered feed is loading. */}
      {isPending ? (
        <span className="absolute inset-x-0 top-0 h-0.5 animate-pulse bg-[#F9E400]" />
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <form onSubmit={onSearchSubmit} className="flex min-w-[230px] flex-1 gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search captions…"
              className="h-9 w-full rounded-lg border border-[#262626] bg-[#141414] pl-9 pr-3 text-sm text-zinc-200 placeholder:text-zinc-500 outline-none transition focus:border-[#F9E400]/60 focus:ring-2 focus:ring-[#F9E400]/20"
            />
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-[#F9E400] px-3 text-sm font-medium text-black transition hover:bg-[#F9E400]/90 disabled:opacity-60"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            {isPending ? "Searching…" : "Search"}
          </button>
        </form>

        <SearchableSelect
          ariaLabel="Filter by account"
          className="w-44"
          value={current.account}
          onChange={(value) => apply({ account: value })}
          allOption={{ value: "all", label: "All accounts" }}
          options={accounts.map((a) => ({ value: a.id, label: `@${a.ig_username}` }))}
          placeholder="Search accounts…"
        />

        {groups.length > 0 ? (
          <select
            aria-label="Filter by group"
            className={selectClass}
            value={current.group}
            onChange={(e) => apply({ group: e.target.value })}
          >
            <option value="all">All groups</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        ) : null}

        <select
          aria-label="Filter by pattern"
          className={selectClass}
          value={current.pattern}
          onChange={(e) => apply({ pattern: e.target.value })}
        >
          <option value="all">All patterns</option>
          {VIRAL_PATTERNS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by status"
          className={selectClass}
          value={current.status}
          onChange={(e) => apply({ status: e.target.value })}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label} ({statusCounts[o.value] ?? 0})
            </option>
          ))}
        </select>

        <select
          aria-label="Sort by"
          className={selectClass}
          value={current.sort}
          onChange={(e) => apply({ sort: e.target.value })}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          aria-label="Toggle sort direction"
          title={current.order === "asc" ? "Ascending" : "Descending"}
          onClick={() => apply({ order: current.order === "asc" ? "desc" : "asc" })}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#262626] bg-[#141414] text-zinc-300 transition hover:border-[#F9E400]/60 hover:text-[#F9E400]"
        >
          {current.order === "asc" ? (
            <ArrowUpWideNarrow className="h-4 w-4" />
          ) : (
            <ArrowDownWideNarrow className="h-4 w-4" />
          )}
        </button>

        <select
          aria-label="Reels per page"
          className={selectClass}
          value={current.perPage}
          // Always set pp explicitly: the page-level default comes from the
          // user's saved preference now, so "no param" no longer means 10.
          onChange={(e) => apply({ pp: e.target.value })}
        >
          {PER_PAGE_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n} / page
            </option>
          ))}
        </select>

        {isFiltered ? (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              apply({ account: null, group: null, pattern: null, status: null, q: null });
            }}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-[#262626] bg-[#141414] px-3 text-sm text-zinc-400 transition hover:border-rose-500/50 hover:text-rose-300"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </button>
        ) : null}
      </div>

      <p className="mt-2 px-1 text-xs text-zinc-500">
        {total} {total === 1 ? "reel" : "reels"}
        {isFiltered ? " match your filters" : " tracked"}
      </p>
    </div>
  );
}
