"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Search,
  Trash2,
  UserCheck,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { requestJson, notifyError } from "@/lib/utils/api";
import { cn } from "@/lib/utils";

// The review queue.
//
// Purpose-built rather than the generic DataTable because the operating model
// of a waiting list is BATCHES: you filter to pending, tick a dozen people, and
// let them in together. Row selection is the whole workflow, and the generic
// table has no notion of it.

export type WaitlistRow = {
  id: string;
  email: string;
  user_id: string | null;
  source: string;
  status: "pending" | "invited" | "approved" | "rejected";
  queue_number: number;
  name: string | null;
  instagram_handle: string | null;
  niche: string | null;
  follower_range: string | null;
  referral_source: string | null;
  note: string | null;
  locale: string | null;
  admin_note: string | null;
  created_at: string;
  approved_at: string | null;
};

export type WaitlistStats = {
  total: number;
  pending: number;
  invited: number;
  approved: number;
  rejected: number;
  last7d: number;
};

type ListPayload = {
  rows: WaitlistRow[];
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  stats: WaitlistStats;
};

const FILTERS = [
  { key: "pending", label: "Pending" },
  { key: "invited", label: "Shortlisted" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "", label: "All" },
] as const;

const STATUS_TONE: Record<WaitlistRow["status"], "secondary" | "default" | "destructive" | "outline"> = {
  pending: "secondary",
  invited: "outline",
  approved: "default",
  rejected: "destructive",
};

export function WaitlistTable({ onStats }: { onStats?: (stats: WaitlistStats) => void }) {
  const confirm = useConfirm();

  const [status, setStatus] = useState<string>("pending");
  const [q, setQ] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<ListPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [working, setWorking] = useState(false);

  const load = useCallback(
    async (signal: { cancelled: boolean }) => {
      setLoading(true);
      const sp = new URLSearchParams({ page: String(page), per_page: "50" });
      if (q) sp.set("q", q);
      if (status) sp.set("status", status);
      try {
        const res = await requestJson<ListPayload>(`/api/admin/waitlist?${sp.toString()}`);
        if (signal.cancelled) return;
        setData(res);
        onStats?.(res.stats);
        // Drop selections that are no longer on screen, so a bulk action can
        // never hit a row the admin can't currently see.
        setSelected((prev) => {
          const visible = new Set(res.rows.map((r) => r.id));
          const next = new Set([...prev].filter((id) => visible.has(id)));
          return next.size === prev.size ? prev : next;
        });
      } catch (err) {
        if (!signal.cancelled) {
          notifyError(err, "Failed to load the waiting list.");
          setData(null);
        }
      } finally {
        if (!signal.cancelled) setLoading(false);
      }
    },
    // onStats is a parent callback; including it would refetch on every parent
    // render. The list only depends on the query below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [page, q, status]
  );

  useEffect(() => {
    const signal = { cancelled: false };
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [load]);

  const rows = data?.rows ?? [];
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const toggleAll = () => {
    setSelected((prev) => {
      if (rows.every((r) => prev.has(r.id))) return new Set();
      return new Set(rows.map((r) => r.id));
    });
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const refetch = () => load({ cancelled: false });

  const setOne = async (row: WaitlistRow, next: WaitlistRow["status"]) => {
    if (next === "approved") {
      const ok = await confirm({
        title: `Let ${row.email} in?`,
        description: "They get access immediately and, if waiting-list emails are on, a 'you're in' email.",
        confirmText: "Approve",
      });
      if (!ok) return;
    }
    setWorking(true);
    try {
      const res = await requestJson<{ emailSent: boolean }>(`/api/admin/waitlist/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      toast.success(next === "approved" ? (res.emailSent ? "Approved — email sent" : "Approved") : "Updated");
      refetch();
    } catch (err) {
      notifyError(err);
    } finally {
      setWorking(false);
    }
  };

  const bulk = async (next: WaitlistRow["status"]) => {
    const ids = [...selected];
    if (ids.length === 0) return;
    const ok = await confirm({
      title: `${next === "approved" ? "Approve" : next === "rejected" ? "Reject" : "Update"} ${ids.length} ${ids.length === 1 ? "person" : "people"}?`,
      description:
        next === "approved"
          ? "They all get access immediately, and an email each if waiting-list emails are on."
          : "This changes their status in the queue.",
      confirmText: "Confirm",
    });
    if (!ok) return;

    setWorking(true);
    try {
      const res = await requestJson<{ changed: number; emailed: number }>("/api/admin/waitlist/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, status: next }),
      });
      toast.success(`${res.changed} updated${res.emailed ? ` · ${res.emailed} emailed` : ""}`);
      setSelected(new Set());
      refetch();
    } catch (err) {
      notifyError(err);
    } finally {
      setWorking(false);
    }
  };

  const remove = async (row: WaitlistRow) => {
    const ok = await confirm({
      title: `Delete ${row.email}?`,
      description:
        "Rejecting is usually better — it keeps the address on file so it can't quietly rejoin at the top of the queue. Delete is for junk and erasure requests.",
      confirmText: "Delete",
      destructive: true,
    });
    if (!ok) return;
    setWorking(true);
    try {
      await requestJson(`/api/admin/waitlist/${row.id}`, { method: "DELETE" });
      toast.success("Deleted");
      refetch();
    } catch (err) {
      notifyError(err);
    } finally {
      setWorking(false);
    }
  };

  const exportHref = useMemo(
    () => `/api/admin/waitlist/export${status ? `?status=${status}` : ""}`,
    [status]
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Filters + search */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key || "all"}
              type="button"
              onClick={() => {
                setStatus(f.key);
                setPage(1);
                setSelected(new Set());
              }}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-medium transition",
                status === f.key
                  ? "bg-accent-brand/12 text-accent-brand"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              {f.label}
              {data && f.key ? (
                <span className="ms-1.5 tabular-nums text-xs opacity-70">
                  {data.stats[f.key as keyof WaitlistStats]}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <form
          className="ms-auto flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setQ(searchInput.trim());
            setPage(1);
          }}
        >
          <div className="relative">
            <Search className="absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Email, name, handle, niche…"
              className="ps-8 sm:w-64"
            />
          </div>
          <Button type="submit" variant="secondary" size="lg">
            Search
          </Button>
          <Button asChild variant="outline" size="lg">
            <a href={exportHref} download>
              <Download className="h-4 w-4" />
              CSV
            </a>
          </Button>
        </form>
      </div>

      {/* Bulk action bar — only present when there's a selection. */}
      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-accent-brand/30 bg-accent-brand/5 px-3 py-2">
          <span className="text-sm font-medium text-foreground">
            {selected.size} selected
          </span>
          <div className="ms-auto flex flex-wrap gap-1.5">
            <Button size="sm" onClick={() => void bulk("approved")} disabled={working}>
              <UserCheck className="h-4 w-4" />
              Approve
            </Button>
            <Button size="sm" variant="outline" onClick={() => void bulk("invited")} disabled={working}>
              Shortlist
            </Button>
            <Button size="sm" variant="outline" onClick={() => void bulk("rejected")} disabled={working}>
              Reject
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2 text-left">
              <th className="w-10 px-3 py-2.5">
                <input
                  type="checkbox"
                  aria-label="Select all on this page"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="h-4 w-4 accent-[var(--accent-brand,currentColor)]"
                />
              </th>
              {["#", "Applicant", "Fit", "Source", "Status", "Joined", ""].map((h, i) => (
                <th
                  key={i}
                  className="px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-border/60">
                  {Array.from({ length: 8 }).map((__, j) => (
                    <td key={j} className="px-3 py-2.5">
                      <Skeleton className="h-4 w-full max-w-[140px]" />
                    </td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-sm text-muted-foreground">
                  Nobody here yet.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b border-border/60 transition-colors hover:bg-surface-2/60">
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      aria-label={`Select ${row.email}`}
                      checked={selected.has(row.id)}
                      onChange={() => toggleOne(row.id)}
                      className="h-4 w-4"
                    />
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-muted-foreground">{row.queue_number}</td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-foreground">{row.email}</div>
                    <div className="text-xs text-muted-foreground">
                      {row.name ?? "—"}
                      {row.instagram_handle ? ` · @${row.instagram_handle}` : ""}
                      {row.user_id ? " · has account" : ""}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {row.niche ?? "—"}
                    {row.follower_range ? <div>{row.follower_range}</div> : null}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {row.source}
                    {row.referral_source ? <div className="truncate max-w-[140px]">{row.referral_source}</div> : null}
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variant={STATUS_TONE[row.status]}>{row.status}</Badge>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-xs text-muted-foreground">
                    {new Date(row.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex justify-end gap-1">
                      {row.status !== "approved" ? (
                        <Button
                          size="icon-sm"
                          variant="outline"
                          aria-label="Approve"
                          title="Approve"
                          disabled={working}
                          onClick={() => void setOne(row, "approved")}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      ) : null}
                      {row.status !== "rejected" ? (
                        <Button
                          size="icon-sm"
                          variant="outline"
                          aria-label="Reject"
                          title="Reject"
                          disabled={working}
                          onClick={() => void setOne(row, "rejected")}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      ) : null}
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Delete"
                        title="Delete"
                        disabled={working}
                        onClick={() => void remove(row)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {data ? `${data.total} result${data.total === 1 ? "" : "s"} · page ${data.page} of ${data.totalPages}` : "—"}
        </span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            disabled={!data || page >= data.totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
