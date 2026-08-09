"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { requestJson, notifyError } from "@/lib/utils/api";
import { CURRENCIES, type Currency } from "@/lib/billing/currency";
import type { AdminPromotionRow } from "@/app/api/admin/billing/promotions/route";
import type { AdminPlanRow } from "@/lib/admin/plans";

// Promo codes. Stripe validates and counts them; this lists them, creates them
// and retires them.
//
// Percent-off is the default because Stripe's amount-off coupons carry ONE
// currency — a fixed discount can only ever apply to prices in that currency,
// which in a three-currency catalog is usually not what the admin means.

const selectClass =
  "h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

function discountLabel(promo: AdminPromotionRow): string {
  if (promo.percentOff != null) return `${promo.percentOff}% off`;
  if (promo.amountOff != null) {
    return `${(promo.amountOff / 100).toLocaleString()} ${promo.amountOffCurrency?.toUpperCase() ?? ""} off`;
  }
  return "—";
}

function durationLabel(promo: AdminPromotionRow): string {
  if (promo.duration === "forever") return "every invoice";
  if (promo.duration === "once") return "first invoice";
  return `${promo.durationInMonths ?? "?"} months`;
}

export function PromoCodes({ plans }: { plans: AdminPlanRow[] }) {
  const confirm = useConfirm();
  const [promotions, setPromotions] = useState<AdminPromotionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [code, setCode] = useState("");
  const [kind, setKind] = useState<"percent" | "amount">("percent");
  const [percentOff, setPercentOff] = useState("20");
  const [amountOff, setAmountOff] = useState("");
  const [amountCurrency, setAmountCurrency] = useState<Currency>("aed");
  const [duration, setDuration] = useState<"once" | "repeating" | "forever">("once");
  const [months, setMonths] = useState("3");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [firstTimeOnly, setFirstTimeOnly] = useState(false);
  const [planId, setPlanId] = useState("");

  const load = useCallback(async (signal?: { cancelled: boolean }) => {
    try {
      const res = await requestJson<{ promotions: AdminPromotionRow[] }>(
        "/api/admin/billing/promotions"
      );
      if (!signal?.cancelled) {
        setPromotions(res.promotions);
        setError(null);
      }
    } catch (err) {
      if (!signal?.cancelled) {
        setPromotions([]);
        setError(err instanceof Error ? err.message : "Failed to load promo codes.");
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
      await requestJson("/api/admin/billing/promotions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim(),
          percentOff: kind === "percent" ? Number(percentOff) : null,
          amountOff: kind === "amount" ? Math.round(Number(amountOff) * 100) : null,
          amountOffCurrency: kind === "amount" ? amountCurrency : null,
          duration,
          durationInMonths: duration === "repeating" ? Number(months) : null,
          maxRedemptions: maxRedemptions.trim() ? Number(maxRedemptions) : null,
          firstTimeOnly,
          planIds: planId ? [planId] : [],
        }),
      });
      toast.success(`${code.trim().toUpperCase()} is live at checkout.`);
      setCode("");
      setOpen(false);
      await load();
    } catch (err) {
      notifyError(err, "Could not create the promo code.");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (promo: AdminPromotionRow) => {
    if (promo.active) {
      const ok = await confirm({
        title: `Stop offering ${promo.code}?`,
        description:
          "New customers won't be able to redeem it. Anyone already on the discount keeps it — nothing is deleted, and you can turn it back on.",
        confirmText: "Turn it off",
        destructive: true,
      });
      if (!ok) return;
    }
    try {
      const res = await requestJson<{ active: boolean }>(
        `/api/admin/billing/promotions/${promo.id}/deactivate`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }
      );
      toast.success(res.active ? `${promo.code} is live again.` : `${promo.code} is off.`);
      await load();
    } catch (err) {
      notifyError(err);
    }
  };

  if (error) {
    return (
      <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
        {error}
      </div>
    );
  }

  if (!promotions) return <Skeleton className="h-32 w-full" />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Codes customers can enter at checkout. A percentage works across every currency; a fixed
          amount applies only to the currency you pick.
        </p>
        <Button size="sm" onClick={() => setOpen((v) => !v)}>
          <Plus className="h-4 w-4" /> New code
        </Button>
      </div>

      {open ? (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface-2 p-4">
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Code</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="LAUNCH20"
              className="w-40"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Discount</Label>
            <select value={kind} onChange={(e) => setKind(e.target.value as "percent" | "amount")} className={selectClass}>
              <option value="percent">Percentage</option>
              <option value="amount">Fixed amount</option>
            </select>
          </div>
          {kind === "percent" ? (
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Percent off</Label>
              <Input
                type="number"
                value={percentOff}
                onChange={(e) => setPercentOff(e.target.value)}
                className="w-24"
              />
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Amount off</Label>
                <Input
                  type="number"
                  value={amountOff}
                  onChange={(e) => setAmountOff(e.target.value)}
                  className="w-28"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Currency</Label>
                <select
                  value={amountCurrency}
                  onChange={(e) => setAmountCurrency(e.target.value as Currency)}
                  className={selectClass}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Applies to</Label>
            <select value={duration} onChange={(e) => setDuration(e.target.value as typeof duration)} className={selectClass}>
              <option value="once">First invoice only</option>
              <option value="repeating">First N months</option>
              <option value="forever">Every invoice</option>
            </select>
          </div>
          {duration === "repeating" ? (
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Months</Label>
              <Input type="number" value={months} onChange={(e) => setMonths(e.target.value)} className="w-24" />
            </div>
          ) : null}
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Max redemptions</Label>
            <Input
              type="number"
              value={maxRedemptions}
              onChange={(e) => setMaxRedemptions(e.target.value)}
              className="w-32"
              placeholder="unlimited"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Restrict to plan</Label>
            <select value={planId} onChange={(e) => setPlanId(e.target.value)} className={selectClass}>
              <option value="">Any plan</option>
              {plans
                .filter((p) => p.kind === "fixed")
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.copy.en.name || p.slug}
                  </option>
                ))}
            </select>
          </div>
          <label className="flex items-center gap-2 pb-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={firstTimeOnly}
              onChange={(e) => setFirstTimeOnly(e.target.checked)}
            />
            New customers only
          </label>
          <Button onClick={create} disabled={busy || !code.trim()}>
            {busy ? "Creating…" : "Create code"}
          </Button>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[46rem] text-sm">
          <thead className="border-b border-border bg-surface-2">
            <tr className="[&>th]:px-4 [&>th]:py-2.5 [&>th]:text-start [&>th]:font-medium [&>th]:text-muted-foreground">
              <th>Code</th>
              <th>Discount</th>
              <th>Applies to</th>
              <th>Used</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {promotions.map((promo) => (
              <tr key={promo.id} className="border-b border-border last:border-0 [&>td]:px-4 [&>td]:py-3">
                <td className="font-mono text-foreground">{promo.code}</td>
                <td className="text-muted-foreground">{discountLabel(promo)}</td>
                <td className="text-muted-foreground">
                  {durationLabel(promo)}
                  {promo.appliesToPlanIds.length > 0 ? " · one plan" : ""}
                  {promo.firstTimeOnly ? " · new customers" : ""}
                </td>
                <td className="text-muted-foreground">
                  {promo.timesRedeemed}
                  {promo.maxRedemptions ? ` / ${promo.maxRedemptions}` : ""}
                </td>
                <td>
                  <Badge variant={promo.active ? "default" : "secondary"}>
                    {promo.active ? "live" : "off"}
                  </Badge>
                </td>
                <td className="text-end">
                  <Button variant="outline" size="sm" onClick={() => toggle(promo)}>
                    {promo.active ? "Turn off" : "Turn on"}
                  </Button>
                </td>
              </tr>
            ))}
            {promotions.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No promo codes yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
