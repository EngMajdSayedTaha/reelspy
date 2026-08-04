"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { RotateCcw, XCircle, ChevronLeft, ChevronRight, Play } from "lucide-react";
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

// Written by /api/cron/run-jobs on every real invocation — GitHub's schedule,
// a manual trigger, and the leftover-drain self-call all update it. There is
// no reliable "next run" to show (GitHub's `*/5` is best-effort and routinely
// lands 45+ minutes apart under load — see docs/cron-cadence.md), so this is
// deliberately a LAST-checked signal, not a promised next-run time.
type Heartbeat = {
  at: string;
  claimed: number;
  processed: number;
  done: number;
  deferred: number;
  failed: number;
  throttled?: boolean;
};

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m ago`;
}

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
  const [heartbeat, setHeartbeat] = useState<Heartbeat | null>(null);
  const [runningWorker, setRunningWorker] = useState(false);

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

  const loadHeartbeat = useCallback(async (signal: { cancelled: boolean }) => {
    try {
      // Generic app_settings reader — no dedicated endpoint needed for one key.
      const res = await requestJson<{ settings: { key: string; value: unknown }[] }>(
        "/api/admin/ops/settings"
      );
      if (signal.cancelled) return;
      const row = res.settings.find((s) => s.key === "run_jobs_heartbeat");
      setHeartbeat((row?.value as Heartbeat | undefined) ?? null);
    } catch {
      // Non-critical: the job table itself still loads and works without this.
    }
  }, []);

  useEffect(() => {
    const signal = { cancelled: false };
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    const signal = { cancelled: false };
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadHeartbeat(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [loadHeartbeat]);

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

  // Same endpoint the Cron tab's "run-jobs" button calls — this is a shortcut to
  // it, not a second implementation. Refreshes the list + heartbeat afterward so
  // the effect of the click is visible immediately instead of on the next poll.
  const runWorkerNow = async () => {
    setRunningWorker(true);
    try {
      const res = await requestJson<{ ok: boolean; status: number }>("/api/admin/ops/cron", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "run-jobs" }),
        timeoutMs: 300_000,
      });
      if (res.ok) toast.success("Worker ran a pass now.");
      else toast.error(`Worker pass returned HTTP ${res.status}.`);
      await Promise.all([load({ cancelled: false }), loadHeartbeat({ cancelled: false })]);
    } catch (err) {
      notifyError(err);
    } finally {
      setRunningWorker(false);
    }
  };

  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-muted-foreground">
        <span>
          {heartbeat ? (
            <>
              Worker last checked <span className="text-foreground">{timeAgo(heartbeat.at)}</span> — claimed{" "}
              {heartbeat.claimed}, done {heartbeat.done}, deferred {heartbeat.deferred}, failed {heartbeat.failed}
              {heartbeat.throttled ? " (Meta circuit was open)" : ""}
            </>
          ) : (
            "Worker heartbeat not recorded yet."
          )}{" "}
          · GitHub&apos;s automatic schedule is best-effort and can lag well past 5 minutes — a queued
          job&apos;s &quot;Run at&quot; is when it becomes eligible, not a promise of when it fires.
        </span>
        <Button variant="secondary" size="sm" disabled={runningWorker} onClick={runWorkerNow}>
          <Play className="h-3.5 w-3.5" />
          {runningWorker ? "Running…" : "Run worker now"}
        </Button>
      </div>

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
