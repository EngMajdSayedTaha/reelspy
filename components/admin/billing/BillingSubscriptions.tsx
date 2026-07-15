"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ExternalLink, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { requestJson, notifyError } from "@/lib/utils/api";
import type { ListResponse } from "@/lib/admin/query";
import type { AdminSubscriptionRow } from "@/app/api/admin/billing/subscriptions/route";

type Response = ListResponse<AdminSubscriptionRow> & { testMode: boolean };

const TIERS = ["", "free", "creator", "pro", "studio", "custom"];
const STATUSES = ["", "active", "trialing", "past_due", "canceled", "unpaid", "incomplete_expired", "inactive"];

function stripeBase(testMode: boolean): string {
  return testMode ? "https://dashboard.stripe.com/test" : "https://dashboard.stripe.com";
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}

export function BillingSubscriptions() {
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [tier, setTier] = useState("");
  const [status, setStatus] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [syncing, setSyncing] = useState<string | null>(null);

  const load = useCallback(
    async (signal: { cancelled: boolean }) => {
      setLoading(true);
      const sp = new URLSearchParams({ page: String(page) });
      if (tier) sp.set("tier", tier);
      if (status) sp.set("status", status);
      if (customerId.trim()) sp.set("q", customerId.trim());
      try {
        const res = await requestJson<Response>(`/api/admin/billing/subscriptions?${sp.toString()}`);
        if (!signal.cancelled) setData(res);
      } catch (err) {
        if (!signal.cancelled) notifyError(err, "Failed to load subscriptions.");
      } finally {
        if (!signal.cancelled) setLoading(false);
      }
    },
    [page, tier, status, customerId]
  );

  useEffect(() => {
    const signal = { cancelled: false };
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [load]);

  const sync = async (userId: string) => {
    setSyncing(userId);
    try {
      const res = await requestJson<{ tier: string; status: string }>(
        `/api/admin/billing/subscriptions/${userId}/sync`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }
      );
      toast.success(`Synced: ${res.tier} / ${res.status}`);
      load({ cancelled: false });
    } catch (err) {
      notifyError(err);
    } finally {
      setSyncing(null);
    }
  };

  const base = stripeBase(data?.testMode ?? false);
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={tier}
          onChange={(e) => {
            setTier(e.target.value);
            setPage(1);
          }}
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none dark:bg-input/30"
        >
          {TIERS.map((t) => (
            <option key={t} value={t}>
              {t ? `tier: ${t}` : "all tiers"}
            </option>
          ))}
        </select>
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
        <Input
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") setPage(1);
          }}
          placeholder="Stripe customer id (cus_…)"
          className="max-w-xs"
        />
        {data?.testMode ? <Badge variant="secondary">Stripe test mode</Badge> : null}
      </div>

      <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2.5">User</th>
              <th className="px-3 py-2.5">Tier</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">Period end</th>
              <th className="px-3 py-2.5">Stripe</th>
              <th className="px-3 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-border/60">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} className="px-3 py-2.5">
                      <Skeleton className="h-4 w-24" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data && data.rows.length ? (
              data.rows.map((r) => (
                <tr key={r.userId} className="border-b border-border/60 hover:bg-surface-2/60">
                  <td className="px-3 py-2.5">
                    <Link href={`/admin/users/${r.userId}`} className="text-foreground hover:text-accent-brand hover:underline">
                      {r.email ?? r.username ?? r.userId}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variant={r.tier === "free" ? "outline" : "default"}>{r.tier}</Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={r.status === "active" ? "text-success" : "text-muted-foreground"}>
                      {r.status}
                    </span>
                    {r.cancelAtPeriodEnd ? <span className="ms-1 text-xs text-warning">(cancels)</span> : null}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{fmtDate(r.currentPeriodEnd)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex gap-2">
                      {r.stripeCustomerId ? (
                        <a
                          href={`${base}/customers/${r.stripeCustomerId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-0.5 text-xs text-accent-brand hover:underline"
                        >
                          customer <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : null}
                      {r.stripeSubscriptionId ? (
                        <a
                          href={`${base}/subscriptions/${r.stripeSubscriptionId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-0.5 text-xs text-accent-brand hover:underline"
                        >
                          sub <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : null}
                      {!r.stripeCustomerId && !r.stripeSubscriptionId ? (
                        <span className="text-xs text-muted-foreground">manual</span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={syncing === r.userId}
                      onClick={() => sync(r.userId)}
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${syncing === r.userId ? "animate-spin" : ""}`} />
                      Sync
                    </Button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">
                  No subscriptions match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

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
