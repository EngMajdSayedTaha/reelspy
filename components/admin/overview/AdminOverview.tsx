"use client";

import { useEffect, useState, useCallback } from "react";
import { Users, CreditCard, Briefcase, Sparkles, Repeat, TriangleAlert } from "lucide-react";
import { StatCard } from "@/components/admin/StatCard";
import { Skeleton } from "@/components/ui/skeleton";
import { requestJson, notifyError } from "@/lib/utils/api";

type Overview = {
  users: { total: number; signups7d: number; signups30d: number };
  subscriptions: { byTier: Record<string, number>; activePaid: number; mrrAed: number };
  jobs: { byStatus: Record<string, number>; failed24h: number; oldestQueuedAgeSeconds: number | null };
  ai: { calls30d: number; estUsd30d: number };
  weeklyLoopCompleters: number;
  generatedAt: string;
};

function fmtAge(seconds: number | null): string {
  if (seconds === null) return "none queued";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

export function AdminOverview() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (signal: { cancelled: boolean }) => {
    try {
      const res = await requestJson<Overview>("/api/admin/overview");
      if (!signal.cancelled) setData(res);
    } catch (err) {
      if (!signal.cancelled) notifyError(err, "Failed to load overview.");
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

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }
  if (!data) return <p className="text-sm text-muted-foreground">No data.</p>;

  const tierSummary = Object.entries(data.subscriptions.byTier)
    .filter(([tier]) => tier !== "free")
    .map(([tier, n]) => `${n} ${tier}`)
    .join(" · ");

  return (
    <div className="flex flex-col gap-6">
      {data.jobs.failed24h > 0 ? (
        <StatCard
          label="Failed jobs (24h)"
          value={data.jobs.failed24h}
          hint="Investigate in Operations →"
          href="/admin/ops"
          tone="danger"
          icon={<TriangleAlert className="h-4 w-4" />}
        />
      ) : null}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Users
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total users"
            value={data.users.total.toLocaleString()}
            href="/admin/users"
            icon={<Users className="h-4 w-4" />}
          />
          <StatCard label="Signups (7d)" value={data.users.signups7d} />
          <StatCard label="Signups (30d)" value={data.users.signups30d} />
          <StatCard
            label="Weekly loop completers"
            value={data.weeklyLoopCompleters}
            icon={<Repeat className="h-4 w-4" />}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Billing
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Active paid subs"
            value={data.subscriptions.activePaid}
            hint={tierSummary || "—"}
            href="/admin/billing"
            icon={<CreditCard className="h-4 w-4" />}
          />
          <StatCard
            label="Est. MRR"
            value={`${data.subscriptions.mrrAed.toLocaleString()} AED`}
            hint="Indicative (plan list prices)"
          />
          <StatCard
            label="AI spend (30d)"
            value={`$${data.ai.estUsd30d.toLocaleString()}`}
            hint={`${data.ai.calls30d.toLocaleString()} calls`}
            icon={<Sparkles className="h-4 w-4" />}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Jobs
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Queued"
            value={data.jobs.byStatus.queued ?? 0}
            hint={`oldest: ${fmtAge(data.jobs.oldestQueuedAgeSeconds)}`}
            href="/admin/ops"
            icon={<Briefcase className="h-4 w-4" />}
            tone={
              data.jobs.oldestQueuedAgeSeconds && data.jobs.oldestQueuedAgeSeconds > 3600
                ? "warning"
                : "default"
            }
          />
          <StatCard label="Running" value={data.jobs.byStatus.running ?? 0} href="/admin/ops" />
          <StatCard
            label="Failed (total)"
            value={data.jobs.byStatus.failed ?? 0}
            href="/admin/ops"
            tone={data.jobs.byStatus.failed ? "warning" : "default"}
          />
          <StatCard label="Done" value={(data.jobs.byStatus.done ?? 0).toLocaleString()} href="/admin/ops" />
        </div>
      </section>
    </div>
  );
}
