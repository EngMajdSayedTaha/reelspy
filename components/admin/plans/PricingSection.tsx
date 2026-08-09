"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { requestJson, notifyError } from "@/lib/utils/api";
import type { AdminPlanRow, AdminPlanPrice } from "@/lib/admin/plans";
import { CURRENCIES, CURRENCY_LABELS, type Currency } from "@/lib/billing/currency";

// Setting a price, and showing what setting it did NOT do.
//
// The whole point of the confirm copy here is that a price change is safe: it
// creates a new Stripe Price for new customers and leaves every existing
// subscriber exactly where they are. Admins reasonably assume the opposite, so
// the UI says it before they click and shows the grandfathered count after.

// Amounts are stored and sent in MINOR units to match Stripe exactly; the admin
// types major units, because nobody wants to think in fils.
function toMajor(minor: number): string {
  return (minor / 100).toFixed(2).replace(/\.00$/, "");
}

function toMinor(major: string): number {
  return Math.round(Number(major) * 100);
}

function PriceHistory({ prices }: { prices: AdminPlanPrice[] }) {
  const retired = prices.filter((p) => !p.isCurrent);
  if (retired.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5 border-t border-border pt-3">
      <p className="text-xs font-medium text-muted-foreground">Earlier prices (still billing)</p>
      {retired.map((price) => (
        <div key={price.id} className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="text-foreground">
            {price.currency.toUpperCase()} {toMajor(price.unitAmount)}/{price.interval === "year" ? "yr" : "mo"}
          </span>
          <span className="font-mono">{price.stripePriceId}</span>
          <Badge variant="secondary">
            {price.subscribers} subscriber{price.subscribers === 1 ? "" : "s"}
          </Badge>
        </div>
      ))}
    </div>
  );
}

export function PricingSection({ plan, onChanged }: { plan: AdminPlanRow; onChanged: () => void }) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  // One price per currency, each its own Stripe Price, so each has its own
  // lineage and can be grandfathered independently. The admin sets the actual
  // local number rather than an exchange rate — AED and SAR are dollar-pegged,
  // so there is no rate to track.
  const [currency, setCurrency] = useState<Currency>(plan.defaultCurrency as Currency);
  const current = plan.prices.find(
    (p) => p.isCurrent && p.interval === "month" && p.currency === currency
  );
  const [amount, setAmount] = useState(current ? toMajor(current.unitAmount) : "");

  const selectCurrency = (next: Currency) => {
    setCurrency(next);
    const existing = plan.prices.find(
      (p) => p.isCurrent && p.interval === "month" && p.currency === next
    );
    setAmount(existing ? toMajor(existing.unitAmount) : "");
  };

  const save = async () => {
    const minor = toMinor(amount);
    if (!Number.isFinite(minor) || minor <= 0) {
      toast.error("Enter a price greater than zero.");
      return;
    }
    if (current && minor === current.unitAmount) {
      toast.info("That's already the current price.");
      return;
    }

    const ok = await confirm({
      title: current
        ? `Change the price to ${currency.toUpperCase()} ${toMajor(minor)}?`
        : `Set the price to ${currency.toUpperCase()} ${toMajor(minor)}?`,
      description: current
        ? `This creates a new price in Stripe for NEW customers. The ${current.subscribers} subscriber${
            current.subscribers === 1 ? "" : "s"
          } already on ${currency.toUpperCase()} ${toMajor(current.unitAmount)} keep${
            current.subscribers === 1 ? "s" : ""
          } paying that — nobody is repriced. You can move them separately afterwards.`
        : "This creates the plan's price in Stripe. Customers can buy it as soon as the plan is published.",
      confirmText: current ? "Create the new price" : "Set the price",
    });
    if (!ok) return;

    setBusy(true);
    try {
      const res = await requestJson<{ grandfathered: number }>(`/api/admin/plans/${plan.id}/prices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval: "month", currency, unitAmount: minor }),
      });
      toast.success(
        res.grandfathered > 0
          ? `New price live. ${res.grandfathered} existing subscriber${
              res.grandfathered === 1 ? "" : "s"
            } stay on the old one.`
          : "New price live."
      );
      onChanged();
    } catch (err) {
      notifyError(err, "Could not set the price.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Pricing</CardTitle>
        <CardDescription>
          Changing the price creates a new one in Stripe for new customers.{" "}
          <strong>Existing subscribers are never repriced</strong> — they keep the price they signed up on
          for as long as they stay subscribed.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Currency</Label>
            <select
              value={currency}
              onChange={(e) => selectCurrency(e.target.value as Currency)}
              className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            >
              {CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {CURRENCY_LABELS[code]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">
              Price per month ({currency.toUpperCase()})
            </Label>
            <Input
              type="number"
              inputMode="decimal"
              step="1"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-40"
              placeholder="149"
            />
          </div>
          <Button onClick={save} disabled={busy || !amount.trim()}>
            {busy ? "Saving…" : current ? "Change price" : "Set price"}
          </Button>
        </div>

        {current ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>
              Live:{" "}
              <span className="text-foreground">
                {currency.toUpperCase()} {toMajor(current.unitAmount)}/mo
              </span>
            </span>
            <span className="font-mono">{current.stripePriceId}</span>
            <Badge variant="secondary">
              {current.subscribers} subscriber{current.subscribers === 1 ? "" : "s"}
            </Badge>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            No {currency.toUpperCase()} price yet. A plan needs a price in its default currency (
            {plan.defaultCurrency.toUpperCase()}) before it can be published.
          </p>
        )}

        <PriceHistory prices={plan.prices.filter((p) => p.currency === currency)} />
      </CardContent>
    </Card>
  );
}
