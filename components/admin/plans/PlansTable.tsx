"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { requestJson, notifyError } from "@/lib/utils/api";
import type { AdminPlanRow } from "@/lib/admin/plans";

// The plan catalog at a glance: what exists, what it costs, who is on it.
//
// Not built on DataTable — that component is server-paginated over a list
// endpoint, and there are a handful of plans, all needed at once (the editor
// links straight off them). A plain fetch keeps the whole catalog on screen.

type Response = { plans: AdminPlanRow[] };

function statusTone(status: string): "default" | "secondary" | "outline" {
  if (status === "published") return "default";
  if (status === "draft") return "outline";
  return "secondary";
}

function priceLabel(plan: AdminPlanRow): string {
  const current = plan.prices.filter((p) => p.isCurrent);
  if (plan.kind === "custom") return "Priced per configuration";
  if (current.length === 0) return "—";
  return current
    .map((p) => `${p.currency.toUpperCase()} ${(p.unitAmount / 100).toLocaleString()}/${p.interval === "year" ? "yr" : "mo"}`)
    .join(" · ");
}

export function PlansTable() {
  const [plans, setPlans] = useState<AdminPlanRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newSlug, setNewSlug] = useState("");
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (signal?: { cancelled: boolean }) => {
    try {
      const res = await requestJson<Response>("/api/admin/plans");
      if (!signal?.cancelled) {
        setPlans(res.plans);
        setError(null);
      }
    } catch (err) {
      if (!signal?.cancelled) {
        setPlans([]);
        setError(err instanceof Error ? err.message : "Failed to load plans.");
      }
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

  const create = async () => {
    setBusy(true);
    try {
      const res = await requestJson<{ id: string; slug: string }>("/api/admin/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: newSlug.trim(), name: newName.trim() }),
      });
      toast.success(`Created "${res.slug}" as a draft — it isn't purchasable yet.`);
      setNewSlug("");
      setNewName("");
      setCreating(false);
      await load();
    } catch (err) {
      notifyError(err, "Could not create the plan.");
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
        {error}
      </div>
    );
  }

  if (!plans) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Editing a plan is live for customers within about a minute. Prices are grandfathered —
          changing one never reprices anyone already subscribed.
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => load()}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
          <Button size="sm" onClick={() => setCreating((v) => !v)}>
            <Plus className="h-4 w-4" /> New plan
          </Button>
        </div>
      </div>

      {creating ? (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface-2 p-4">
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Slug (permanent once anyone subscribes)</Label>
            <Input
              value={newSlug}
              onChange={(e) => setNewSlug(e.target.value)}
              placeholder="agency"
              className="w-48"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Display name</Label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Agency"
              className="w-56"
            />
          </div>
          <Button onClick={create} disabled={busy || !newSlug.trim() || !newName.trim()}>
            {busy ? "Creating…" : "Create draft"}
          </Button>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[52rem] text-sm">
          <thead className="border-b border-border bg-surface-2 text-start">
            <tr className="[&>th]:px-4 [&>th]:py-2.5 [&>th]:text-start [&>th]:font-medium [&>th]:text-muted-foreground">
              <th>Plan</th>
              <th>Status</th>
              <th>Price</th>
              <th>Limits</th>
              <th>Trial</th>
              <th>Subscribers</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {plans.map((plan) => (
              <tr key={plan.id} className="border-b border-border last:border-0 [&>td]:px-4 [&>td]:py-3">
                <td>
                  <div className="font-medium text-foreground">{plan.copy.en.name || plan.slug}</div>
                  <div className="font-mono text-xs text-muted-foreground">{plan.slug}</div>
                </td>
                <td>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant={statusTone(plan.status)}>{plan.status}</Badge>
                    {plan.adminGrant ? <Badge variant="outline">admin</Badge> : null}
                  </div>
                </td>
                <td className="text-muted-foreground">{priceLabel(plan)}</td>
                <td className="text-muted-foreground">
                  {plan.entitlements ? (
                    <span>
                      {plan.entitlements.accounts} accts ·{" "}
                      {plan.entitlements.scripts_mo < 0 ? "∞" : plan.entitlements.scripts_mo} scripts ·{" "}
                      {plan.entitlements.model}
                    </span>
                  ) : (
                    <span className="text-destructive">invalid</span>
                  )}
                </td>
                <td className="text-muted-foreground">
                  {plan.trialDays > 0 ? `${plan.trialDays} days` : "—"}
                </td>
                <td className="text-foreground">{plan.subscribers}</td>
                <td className="text-end">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/admin/plans/${plan.id}`}>Edit</Link>
                  </Button>
                </td>
              </tr>
            ))}
            {plans.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  No plans yet — run <code className="font-mono">npm run seed:plans</code> to import the
                  built-in ones.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
