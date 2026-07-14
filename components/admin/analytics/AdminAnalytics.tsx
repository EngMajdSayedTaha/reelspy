"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/admin/StatCard";
import { requestJson, notifyError } from "@/lib/utils/api";

type Analytics = {
  funnel: {
    signed_up: number;
    ig_connected: number;
    account_added: number;
    feed_synced: number;
    first_script: number;
    met_sla: number;
    total: number;
  };
  retentionCohorts: { cohort_week: string; active_week: string; active_users: number }[];
  publishSuccessWeekly: { week: string; platform: string; succeeded: number; total: number; success_rate: number }[];
  aiCostTop: { user_id: string; calls: number; est_usd: number }[];
  weeklyLoopCompleters: { week: string; loop_completers: number }[];
};

function weekLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Pivot retention_cohorts into a cohort × week-offset grid keyed by retention %.
function useRetentionGrid(rows: Analytics["retentionCohorts"]) {
  return useMemo(() => {
    const byCohort = new Map<string, Map<number, number>>();
    const cohortSize = new Map<string, number>();
    let maxOffset = 0;
    for (const r of rows) {
      const cohort = r.cohort_week;
      const offset = Math.round(
        (new Date(r.active_week).getTime() - new Date(cohort).getTime()) / (7 * 86_400_000)
      );
      if (offset < 0) continue;
      maxOffset = Math.max(maxOffset, offset);
      if (!byCohort.has(cohort)) byCohort.set(cohort, new Map());
      byCohort.get(cohort)!.set(offset, r.active_users);
      if (offset === 0) cohortSize.set(cohort, r.active_users);
    }
    const cohorts = [...byCohort.keys()].sort();
    return { byCohort, cohortSize, cohorts, maxOffset };
  }, [rows]);
}

function retentionColor(pct: number): string {
  // 0% → faint, 100% → strong primary. Uses opacity over the primary color.
  const alpha = Math.max(0.06, Math.min(1, pct));
  return `color-mix(in oklch, var(--primary) ${Math.round(alpha * 100)}%, transparent)`;
}

export function AdminAnalytics() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (signal: { cancelled: boolean }) => {
    setLoading(true);
    try {
      const res = await requestJson<Analytics>("/api/admin/analytics");
      if (!signal.cancelled) setData(res);
    } catch (err) {
      if (!signal.cancelled) notifyError(err, "Failed to load analytics.");
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

  const grid = useRetentionGrid(data?.retentionCohorts ?? []);

  if (loading) return <Skeleton className="h-96 rounded-xl" />;
  if (!data) return <p className="text-sm text-muted-foreground">No data.</p>;

  const f = data.funnel;
  const pct = (n: number) => (f.total ? `${Math.round((n / f.total) * 100)}%` : "—");

  return (
    <div className="flex flex-col gap-8">
      {/* Activation funnel */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Activation funnel
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Signed up" value={f.signed_up} />
          <StatCard label="IG connected" value={f.ig_connected} hint={pct(f.ig_connected)} />
          <StatCard label="Account added" value={f.account_added} hint={pct(f.account_added)} />
          <StatCard label="Feed synced" value={f.feed_synced} hint={pct(f.feed_synced)} />
          <StatCard label="First script" value={f.first_script} hint={pct(f.first_script)} />
          <StatCard label="Met 10-min SLA" value={f.met_sla} hint={pct(f.met_sla)} tone="success" />
        </div>
      </section>

      {/* Retention cohorts */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Retention cohorts (weekly)
        </h2>
        {grid.cohorts.length ? (
          <div className="overflow-x-auto">
            <table className="border-separate border-spacing-1 text-xs">
              <thead>
                <tr>
                  <th className="px-2 py-1 text-left text-muted-foreground">Cohort</th>
                  {Array.from({ length: grid.maxOffset + 1 }).map((_, w) => (
                    <th key={w} className="px-2 py-1 text-center text-muted-foreground">
                      W{w}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.cohorts.map((cohort) => {
                  const size = grid.cohortSize.get(cohort) ?? 0;
                  const cells = grid.byCohort.get(cohort)!;
                  return (
                    <tr key={cohort}>
                      <td className="whitespace-nowrap px-2 py-1 text-muted-foreground">
                        {weekLabel(cohort)} <span className="text-foreground">({size})</span>
                      </td>
                      {Array.from({ length: grid.maxOffset + 1 }).map((_, w) => {
                        const active = cells.get(w);
                        if (active === undefined)
                          return <td key={w} className="px-2 py-1" />;
                        const ratio = size ? active / size : 0;
                        return (
                          <td
                            key={w}
                            className="rounded px-2 py-1 text-center tabular-nums text-foreground"
                            style={{ backgroundColor: retentionColor(ratio) }}
                            title={`${active} of ${size} (${Math.round(ratio * 100)}%)`}
                          >
                            {Math.round(ratio * 100)}%
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No cohort data.</p>
        )}
      </section>

      {/* Weekly loop completers */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Weekly loop completers
        </h2>
        {data.weeklyLoopCompleters.length ? (
          <div className="flex items-end gap-1.5 overflow-x-auto rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            {data.weeklyLoopCompleters.map((w) => {
              const max = Math.max(...data.weeklyLoopCompleters.map((x) => x.loop_completers), 1);
              return (
                <div key={w.week} className="flex flex-col items-center gap-1">
                  <div
                    className="w-6 rounded-t bg-primary/70"
                    style={{ height: `${(w.loop_completers / max) * 120 + 2}px` }}
                    title={`${w.loop_completers}`}
                  />
                  <span className="text-[10px] text-muted-foreground">{weekLabel(w.week)}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No data.</p>
        )}
      </section>

      {/* Publish success + AI cost */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Publish success (weekly)
          </h2>
          <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2 text-left text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2">Week</th>
                  <th className="px-3 py-2">Platform</th>
                  <th className="px-3 py-2 text-right">Success</th>
                </tr>
              </thead>
              <tbody>
                {data.publishSuccessWeekly.map((r, i) => (
                  <tr key={i} className="border-b border-border/60">
                    <td className="px-3 py-1.5 text-muted-foreground">{weekLabel(r.week)}</td>
                    <td className="px-3 py-1.5">{r.platform ?? "—"}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {Math.round((r.success_rate ?? 0) * 100)}% ({r.succeeded}/{r.total})
                    </td>
                  </tr>
                ))}
                {data.publishSuccessWeekly.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">
                      No data.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Top AI cost (all-time)
          </h2>
          <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2 text-left text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2">User</th>
                  <th className="px-3 py-2 text-right">Calls</th>
                  <th className="px-3 py-2 text-right">Est. USD</th>
                </tr>
              </thead>
              <tbody>
                {data.aiCostTop.map((r) => (
                  <tr key={r.user_id} className="border-b border-border/60">
                    <td className="px-3 py-1.5 font-mono text-xs">{r.user_id.slice(0, 12)}…</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{r.calls}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">${r.est_usd}</td>
                  </tr>
                ))}
                {data.aiCostTop.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">
                      No data.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
