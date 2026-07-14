"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Search, ArrowUpDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { requestJson, notifyError } from "@/lib/utils/api";
import type { ListResponse } from "@/lib/admin/query";
import { cn } from "@/lib/utils";

export type Column<T> = {
  /** Stable key; also the sort column when `sortable`. */
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  sortable?: boolean;
  className?: string;
};

// Generic server-paginated table. All list state (page, q, sort, dir) lives in
// the URL search params so a view is shareable/back-button-friendly, and the
// table refetches whenever they change. Errors surface via notifyError (toast),
// loading shows a skeleton. Extra fixed query params (e.g. a resource slug or
// user filter) are passed via `params` and merged into every request.
export function DataTable<T>({
  endpoint,
  columns,
  searchable = true,
  searchPlaceholder = "Search…",
  params,
  rowKey,
  emptyMessage = "No results.",
}: {
  endpoint: string;
  columns: Column<T>[];
  searchable?: boolean;
  searchPlaceholder?: string;
  params?: Record<string, string | undefined>;
  rowKey: (row: T) => string;
  emptyMessage?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const q = searchParams.get("q") ?? "";
  const sort = searchParams.get("sort") ?? "";
  const dir = (searchParams.get("dir") as "asc" | "desc") ?? "desc";

  const [data, setData] = useState<ListResponse<T> | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState(q);

  // Serialize the fixed params so the fetch effect re-runs when they change.
  const paramsKey = useMemo(() => JSON.stringify(params ?? {}), [params]);

  const updateParams = useCallback(
    (next: Record<string, string | null>) => {
      const sp = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(next)) {
        if (v === null || v === "") sp.delete(k);
        else sp.set(k, v);
      }
      router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  const load = useCallback(
    async (signal: { cancelled: boolean }) => {
      setLoading(true);
      const sp = new URLSearchParams();
      sp.set("page", String(page));
      if (q) sp.set("q", q);
      if (sort) sp.set("sort", sort);
      if (dir) sp.set("dir", dir);
      const extra = params ?? {};
      for (const [k, v] of Object.entries(extra)) {
        if (v) sp.set(k, v);
      }
      const sep = endpoint.includes("?") ? "&" : "?";
      try {
        const res = await requestJson<ListResponse<T>>(`${endpoint}${sep}${sp.toString()}`);
        if (!signal.cancelled) setData(res);
      } catch (err) {
        if (!signal.cancelled) {
          notifyError(err, "Failed to load data.");
          setData(null);
        }
      } finally {
        if (!signal.cancelled) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [endpoint, page, q, sort, dir, paramsKey]
  );

  useEffect(() => {
    const signal = { cancelled: false };
    // load() only setStates after an awaited fetch (or synchronously flips the
    // loading flag), so this isn't a cascading-render footgun despite the heuristic.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [load]);

  // Keep the input in sync when q is changed elsewhere (e.g. back button).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearchInput(q);
  }, [q]);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    updateParams({ q: searchInput.trim() || null, page: "1" });
  };

  const toggleSort = (col: Column<T>) => {
    if (!col.sortable) return;
    if (sort === col.key) {
      updateParams({ dir: dir === "asc" ? "desc" : "asc" });
    } else {
      updateParams({ sort: col.key, dir: "desc", page: "1" });
    }
  };

  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="flex flex-col gap-3">
      {searchable ? (
        <form onSubmit={submitSearch} className="flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={searchPlaceholder}
              className="ps-8"
            />
          </div>
          <Button type="submit" variant="secondary" size="lg">
            Search
          </Button>
          {q ? (
            <Button
              type="button"
              variant="ghost"
              size="lg"
              onClick={() => {
                setSearchInput("");
                updateParams({ q: null, page: "1" });
              }}
            >
              Clear
            </Button>
          ) : null}
        </form>
      ) : null}

      <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2 text-left">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    "px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground",
                    col.sortable && "cursor-pointer select-none hover:text-foreground",
                    col.className
                  )}
                  onClick={() => toggleSort(col)}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.header}
                    {col.sortable ? (
                      <ArrowUpDown
                        className={cn(
                          "h-3 w-3",
                          sort === col.key ? "text-foreground" : "text-muted-foreground/50"
                        )}
                      />
                    ) : null}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-border/60">
                  {columns.map((col) => (
                    <td key={col.key} className="px-3 py-2.5">
                      <Skeleton className="h-4 w-full max-w-[160px]" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data && data.rows.length > 0 ? (
              data.rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  className="border-b border-border/60 transition-colors hover:bg-surface-2/60"
                >
                  {columns.map((col) => (
                    <td key={col.key} className={cn("px-3 py-2.5 align-middle", col.className)}>
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-3 py-10 text-center text-sm text-muted-foreground"
                >
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {data ? (
            <>
              {data.total} result{data.total === 1 ? "" : "s"} · page {data.page} of {totalPages}
            </>
          ) : (
            "—"
          )}
        </span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            disabled={page <= 1 || loading}
            onClick={() => updateParams({ page: String(page - 1) })}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            disabled={page >= totalPages || loading}
            onClick={() => updateParams({ page: String(page + 1) })}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
