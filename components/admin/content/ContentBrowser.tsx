"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { toast } from "sonner";
import { Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { JsonViewer } from "@/components/admin/JsonViewer";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { requestJson, notifyError } from "@/lib/utils/api";
import type { ListResponse } from "@/lib/admin/query";

type ResourceMeta = { slug: string; label: string; deletable: boolean };
type Row = Record<string, unknown>;
type Response = ListResponse<Row> & { columns: string[]; deletable: boolean };

function renderCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value.length > 60 ? `${value.slice(0, 60)}…` : value;
  if (Array.isArray(value)) return value.join(", ") || "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function ContentBrowser({ resources }: { resources: ResourceMeta[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const initialResource = searchParams.get("resource") ?? resources[0]?.slug ?? "";
  const initialUser = searchParams.get("user") ?? "";

  const [resource, setResource] = useState(initialResource);
  const [userFilter, setUserFilter] = useState(initialUser);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const meta = resources.find((r) => r.slug === resource);

  // Reflect resource + user into the URL so the view is deep-linkable.
  useEffect(() => {
    const sp = new URLSearchParams();
    if (resource) sp.set("resource", resource);
    if (userFilter.trim()) sp.set("user", userFilter.trim());
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  }, [resource, userFilter, pathname, router]);

  const load = useCallback(
    async (signal: { cancelled: boolean }) => {
      if (!resource) return;
      if (!userFilter.trim() && !q.trim()) {
        setData(null);
        setError("Provide a user id or a search term to browse rows.");
        return;
      }
      setLoading(true);
      setError(null);
      const sp = new URLSearchParams({ page: String(page) });
      if (userFilter.trim()) sp.set("user", userFilter.trim());
      if (q.trim()) sp.set("q", q.trim());
      try {
        const res = await requestJson<Response>(`/api/admin/content/${resource}?${sp.toString()}`);
        if (!signal.cancelled) setData(res);
      } catch (err) {
        if (!signal.cancelled) {
          notifyError(err, "Failed to load rows.");
          setData(null);
        }
      } finally {
        if (!signal.cancelled) setLoading(false);
      }
    },
    [resource, userFilter, q, page]
  );

  useEffect(() => {
    const signal = { cancelled: false };
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [load]);

  const confirm = useConfirm();
  const del = async (id: string) => {
    const ok = await confirm({
      title: "Delete this row?",
      description: "This permanently deletes the row. A snapshot is written to the audit log.",
      destructive: true,
      confirmText: "Delete",
    });
    if (!ok) return;
    try {
      await requestJson(`/api/admin/content/${resource}/${id}`, { method: "DELETE" });
      toast.success("Row deleted");
      load({ cancelled: false });
    } catch (err) {
      notifyError(err);
    }
  };

  const columns = data?.columns ?? [];
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={resource}
          onChange={(e) => {
            setResource(e.target.value);
            setPage(1);
          }}
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none dark:bg-input/30"
        >
          {resources.map((r) => (
            <option key={r.slug} value={r.slug}>
              {r.label}
            </option>
          ))}
        </select>
        <Input
          value={userFilter}
          onChange={(e) => setUserFilter(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && setPage(1)}
          placeholder="Filter by user id"
          className="max-w-xs"
        />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && setPage(1)}
          placeholder={meta ? "Search…" : ""}
          className="max-w-xs"
        />
        <Button variant="secondary" size="lg" onClick={() => setPage(1)} disabled={loading}>
          Load
        </Button>
      </div>

      {error ? <p className="text-sm text-muted-foreground">{error}</p> : null}

      {loading ? (
        <Skeleton className="h-48 rounded-xl" />
      ) : data && data.rows.length ? (
        <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-left text-xs uppercase tracking-wide text-muted-foreground">
                {columns.map((c) => (
                  <th key={c} className="px-3 py-2.5 whitespace-nowrap">
                    {c}
                  </th>
                ))}
                <th className="px-3 py-2.5 text-right">Row</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, i) => (
                <tr key={(row.id as string) ?? i} className="border-b border-border/60 hover:bg-surface-2/60">
                  {columns.map((c) => (
                    <td key={c} className="px-3 py-2.5 align-top text-foreground">
                      {renderCell(row[c])}
                    </td>
                  ))}
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-40">
                        <JsonViewer data={row} label="full" />
                      </div>
                      {data.deletable ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => del(row.id as string)}
                          aria-label="Delete row"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !error && !loading ? (
        <p className="text-sm text-muted-foreground">No rows.</p>
      ) : null}

      {data ? (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{data.total} total · page {data.page} of {totalPages}</span>
          <div className="flex gap-1">
            <Button variant="outline" size="icon-sm" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon-sm" disabled={page >= totalPages || loading} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
