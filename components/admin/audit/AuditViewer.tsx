"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { JsonViewer } from "@/components/admin/JsonViewer";
import { requestJson, notifyError } from "@/lib/utils/api";
import type { ListResponse } from "@/lib/admin/query";

type AuditEntry = {
  id: string;
  admin_id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  payload: unknown;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
};

export function AuditViewer() {
  const [data, setData] = useState<ListResponse<AuditEntry> | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [targetType, setTargetType] = useState("");

  const load = useCallback(
    async (signal: { cancelled: boolean }) => {
      setLoading(true);
      const sp = new URLSearchParams({ page: String(page) });
      if (action.trim()) sp.set("action", action.trim());
      if (targetType.trim()) sp.set("target_type", targetType.trim());
      try {
        const res = await requestJson<ListResponse<AuditEntry>>(`/api/admin/audit?${sp.toString()}`);
        if (!signal.cancelled) setData(res);
      } catch (err) {
        if (!signal.cancelled) notifyError(err, "Failed to load audit log.");
      } finally {
        if (!signal.cancelled) setLoading(false);
      }
    },
    [page, action, targetType]
  );

  useEffect(() => {
    const signal = { cancelled: false };
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [load]);

  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={action}
          onChange={(e) => setAction(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && setPage(1)}
          placeholder="action (e.g. user.ban)"
          className="max-w-xs"
        />
        <Input
          value={targetType}
          onChange={(e) => setTargetType(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && setPage(1)}
          placeholder="target type (e.g. user)"
          className="max-w-xs"
        />
        <Button variant="secondary" size="lg" onClick={() => setPage(1)} disabled={loading}>
          Filter
        </Button>
      </div>

      {loading ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : (
        <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2.5">When</th>
                <th className="px-3 py-2.5">Action</th>
                <th className="px-3 py-2.5">Target</th>
                <th className="px-3 py-2.5">Admin</th>
                <th className="px-3 py-2.5">Payload</th>
              </tr>
            </thead>
            <tbody>
              {data && data.rows.length ? (
                data.rows.map((e) => (
                  <tr key={e.id} className="border-b border-border/60 align-top hover:bg-surface-2/60">
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">
                      {new Date(e.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge variant="outline">{e.action}</Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-muted-foreground">{e.target_type}</span>
                      {e.target_id ? (
                        <span className="ms-1 font-mono text-xs text-foreground">{e.target_id.slice(0, 12)}…</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                      {e.admin_id.slice(0, 8)}…
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="w-56">
                        <JsonViewer data={e.payload} label="payload" />
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">
                    No audit entries.
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
