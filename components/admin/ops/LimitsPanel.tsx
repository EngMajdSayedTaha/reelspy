"use client";

import { useCallback, useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/admin/StatCard";
import { requestJson, notifyError } from "@/lib/utils/api";

type Limits = {
  metaLimiter: {
    tokens: number;
    app_usage_pct: number;
    throttled_until: string | null;
    updated_at: string;
  } | null;
  metaTopUsers: { user_id: string; call_count: number; window_start: string }[];
  hotActions: { user_id: string; action: string; call_count: number; window_start: string }[];
};

export function LimitsPanel() {
  const [data, setData] = useState<Limits | null>(null);
  const [loading, setLoading] = useState(true);
  // Captured once on mount (lazy initializer) so the render body stays pure —
  // good enough to decide whether a throttle window is still in the future.
  const [nowMs] = useState(() => Date.now());

  const load = useCallback(async (signal: { cancelled: boolean }) => {
    setLoading(true);
    try {
      const res = await requestJson<Limits>("/api/admin/ops/limits");
      if (!signal.cancelled) setData(res);
    } catch (err) {
      if (!signal.cancelled) notifyError(err, "Failed to load limits.");
    } finally {
      if (!signal.cancelled) setLoading(false);
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

  if (loading) return <Skeleton className="h-48 rounded-xl" />;
  if (!data) return <p className="text-sm text-muted-foreground">No data.</p>;

  const m = data.metaLimiter;
  const throttled = Boolean(m?.throttled_until && new Date(m.throttled_until).getTime() > nowMs);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Meta API tokens" value={m ? Math.floor(m.tokens) : "—"} />
        <StatCard
          label="App usage %"
          value={m ? `${m.app_usage_pct}%` : "—"}
          tone={m && m.app_usage_pct > 80 ? "warning" : "default"}
        />
        <StatCard
          label="Throttled"
          value={throttled ? "yes" : "no"}
          hint={throttled ? `until ${new Date(m!.throttled_until!).toLocaleTimeString()}` : undefined}
          tone={throttled ? "danger" : "default"}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Busiest Meta API users</h3>
          <MiniTable
            rows={data.metaTopUsers.map((u) => ({ a: u.user_id, b: String(u.call_count) }))}
            headA="user id"
            headB="calls"
          />
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Hottest action throttles</h3>
          <MiniTable
            rows={data.hotActions.map((u) => ({ a: `${u.action} · ${u.user_id.slice(0, 8)}…`, b: String(u.call_count) }))}
            headA="action · user"
            headB="calls"
          />
        </div>
      </div>
    </div>
  );
}

function MiniTable({ rows, headA, headB }: { rows: { a: string; b: string }[]; headA: string; headB: string }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">None.</p>;
  return (
    <div className="overflow-hidden rounded-lg ring-1 ring-foreground/10">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-2 text-left text-xs uppercase text-muted-foreground">
            <th className="px-3 py-2">{headA}</th>
            <th className="px-3 py-2 text-right">{headB}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/60">
              <td className="px-3 py-1.5 font-mono text-xs">{r.a}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{r.b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
