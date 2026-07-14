"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { RotateCcw, XCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { JsonViewer } from "@/components/admin/JsonViewer";
import { requestJson, notifyError } from "@/lib/utils/api";
import type { ListResponse } from "@/lib/admin/query";

type Job = {
  id: string;
  kind: string;
  status: string;
  attempts: number;
  max_attempts: number;
  run_at: string;
  last_error: string | null;
  user_id: string | null;
  payload: unknown;
  created_at: string;
};

const STATUSES = ["", "queued", "running", "failed", "done"];

function statusVariant(s: string): "default" | "secondary" | "destructive" | "outline" {
  if (s === "failed") return "destructive";
  if (s === "done") return "secondary";
  if (s === "running") return "default";
  return "outline";
}

export function JobsPanel() {
  const [data, setData] = useState<ListResponse<Job> | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(
    async (signal: { cancelled: boolean }) => {
      setLoading(true);
      const sp = new URLSearchParams({ page: String(page) });
      if (status) sp.set("status", status);
      try {
        const res = await requestJson<ListResponse<Job>>(`/api/admin/ops/jobs?${sp.toString()}`);
        if (!signal.cancelled) setData(res);
      } catch (err) {
        if (!signal.cancelled) notifyError(err, "Failed to load jobs.");
      } finally {
        if (!signal.cancelled) setLoading(false);
      }
    },
    [status, page]
  );

  useEffect(() => {
    const signal = { cancelled: false };
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [load]);

  const act = async (id: string, action: "retry" | "cancel") => {
    setBusy(id);
    try {
      await requestJson(`/api/admin/ops/jobs/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      toast.success(`Job ${action === "retry" ? "re-queued" : "cancelled"}`);
      load({ cancelled: false });
    } catch (err) {
      notifyError(err);
    } finally {
      setBusy(null);
    }
  };

  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none dark:bg-input/30"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s ? `status: ${s}` : "all statuses"}
            </option>
          ))}
        </select>
        <Button variant="outline" size="sm" onClick={() => load({ cancelled: false })} disabled={loading}>
          Refresh
        </Button>
      </div>

      {loading ? (
        <Skeleton className="h-48 rounded-xl" />
      ) : (
        <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2.5">Kind</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Attempts</th>
                <th className="px-3 py-2.5">Run at</th>
                <th className="px-3 py-2.5">Error / payload</th>
                <th className="px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data && data.rows.length ? (
                data.rows.map((j) => (
                  <tr key={j.id} className="border-b border-border/60 align-top hover:bg-surface-2/60">
                    <td className="px-3 py-2.5 font-medium">{j.kind}</td>
                    <td className="px-3 py-2.5">
                      <Badge variant={statusVariant(j.status)}>{j.status}</Badge>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">
                      {j.attempts}/{j.max_attempts}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{new Date(j.run_at).toLocaleString()}</td>
                    <td className="px-3 py-2.5">
                      {j.last_error ? (
                        <p className="mb-1 max-w-xs truncate text-xs text-destructive" title={j.last_error}>
                          {j.last_error}
                        </p>
                      ) : null}
                      <div className="w-40">
                        <JsonViewer data={j.payload} label="payload" />
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="outline" size="sm" disabled={busy === j.id} onClick={() => act(j.id, "retry")}>
                          <RotateCcw className="h-3.5 w-3.5" /> Retry
                        </Button>
                        {j.status !== "done" && j.status !== "failed" ? (
                          <Button variant="ghost" size="sm" disabled={busy === j.id} onClick={() => act(j.id, "cancel")}>
                            <XCircle className="h-3.5 w-3.5" /> Cancel
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">
                    No jobs.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{data ? `${data.total} total · page ${data.page} of ${totalPages}` : "—"}</span>
        <div className="flex gap-1">
          <Button variant="outline" size="icon-sm" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon-sm" disabled={page >= totalPages || loading} onClick={() => setPage((p) => p + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
