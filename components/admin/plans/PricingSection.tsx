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

function PriceHistory({
  prices,
  onMigrate,
}: {
  prices: AdminPlanPrice[];
  onMigrate: (price: AdminPlanPrice) => void;
}) {
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
          {price.subscribers > 0 ? (
            <Button variant="outline" size="sm" onClick={() => onMigrate(price)}>
              Move them to the current price
            </Button>
          ) : null}
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
  const [interval, setInterval] = useState<"month" | "year">("month");
  const current = plan.prices.find(
    (p) => p.isCurrent && p.interval === interval && p.currency === currency
  );
  const [amount, setAmount] = useState(current ? toMajor(current.unitAmount) : "");
  // A sale is a real price with a "was" figure beside it, not a coupon. That
  // keeps the struck-through number honest (it IS the list price), keeps promo
  // codes usable at the same time, and means a sale subscriber is grandfathered
  // on the sale price exactly like any other — no coupon to expire under them.
  const [compareAt, setCompareAt] = useState(current?.compareAtAmount ? toMajor(current.compareAtAmount) : "");
  const [saleEndsAt, setSaleEndsAt] = useState(current?.saleEndsAt?.slice(0, 10) ?? "");

  const reselect = (nextCurrency: Currency, nextInterval: "month" | "year") => {
    setCurrency(nextCurrency);
    setInterval(nextInterval);
    const existing = plan.prices.find(
      (p) => p.isCurrent && p.interval === nextInterval && p.currency === nextCurrency
    );
    setAmount(existing ? toMajor(existing.unitAmount) : "");
    setCompareAt(existing?.compareAtAmount ? toMajor(existing.compareAtAmount) : "");
    setSaleEndsAt(existing?.saleEndsAt?.slice(0, 10) ?? "");
  };

  // What 12 months of the monthly price would cost, so the admin can see what
  // discount a yearly figure actually represents rather than doing the sum.
  const monthly = plan.prices.find(
    (p) => p.isCurrent && p.interval === "month" && p.currency === currency
  );
  const yearlyFull = monthly ? monthly.unitAmount * 12 : null;
  const typedMinor = toMinor(amount);
  const savingPct =
    interval === "year" && yearlyFull && typedMinor > 0 && typedMinor < yearlyFull
      ? Math.round(((yearlyFull - typedMinor) / yearlyFull) * 100)
      : null;

  // Moving existing subscribers is deliberately its own action, and the copy is
  // explicit that it applies at each subscriber's own renewal rather than now —
  // an admin who thinks they're charging people today would be wrong.
  const migrate = async (from: AdminPlanPrice) => {
    if (!current) {
      toast.error("Set a current price first — there's nothing to move them to.");
      return;
    }
    const ok = await confirm({
      title: `Move ${from.subscribers} subscriber${from.subscribers === 1 ? "" : "s"} to ${currency.toUpperCase()} ${toMajor(current.unitAmount)}?`,
      description: `They're on ${currency.toUpperCase()} ${toMajor(from.unitAmount)} today. Nobody is charged now: each one is emailed the old price, the new price and their date, and moves at their own next renewal at least 30 days away. Anyone renewing sooner keeps the old price for one more period.`,
      confirmText: "Schedule the change",
      destructive: true,
    });
    if (!ok) return;

    setBusy(true);
    try {
      const res = await requestJson<{ queued: number }>(`/api/admin/plans/${plan.id}/migrate-price`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromPriceId: from.id, toPriceId: current.id, noticeDays: 30 }),
      });
      toast.success(`Queued ${res.queued} — each moves at their own renewal.`);
      onChanged();
    } catch (err) {
      notifyError(err, "Could not start the migration.");
    } finally {
      setBusy(false);
    }
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
        body: JSON.stringify({
          interval,
          currency,
          unitAmount: minor,
          compareAtAmount: compareAt.trim() ? toMinor(compareAt) : null,
          saleEndsAt: saleEndsAt.trim() ? new Date(`${saleEndsAt}T23:59:59Z`).toISOString() : null,
        }),
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
              onChange={(e) => reselect(e.target.value as Currency, interval)}
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
            <Label className="text-xs text-muted-foreground">Billing period</Label>
            <select
              value={interval}
              onChange={(e) => reselect(currency, e.target.value as "month" | "year")}
              className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            >
              <option value="month">Monthly</option>
              <option value="year">Yearly</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">
              Price per {interval === "year" ? "year" : "month"} ({currency.toUpperCase()})
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
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">
              &ldquo;Was&rdquo; price (optional)
            </Label>
            <Input
              type="number"
              inputMode="decimal"
              value={compareAt}
              onChange={(e) => setCompareAt(e.target.value)}
              className="w-32"
              placeholder="—"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Sale ends (optional)</Label>
            <Input
              type="date"
              value={saleEndsAt}
              onChange={(e) => setSaleEndsAt(e.target.value)}
              className="w-44"
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
                {currency.toUpperCase()} {toMajor(current.unitAmount)}/
                {current.interval === "year" ? "yr" : "mo"}
              </span>
            </span>
            <span className="font-mono">{current.stripePriceId}</span>
            <Badge variant="secondary">
              {current.subscribers} subscriber{current.subscribers === 1 ? "" : "s"}
            </Badge>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            No {interval === "year" ? "yearly" : "monthly"} {currency.toUpperCase()} price yet. A plan
            needs a monthly price in its default currency ({plan.defaultCurrency.toUpperCase()}) before it
            can be published.
          </p>
        )}

        {compareAt.trim() ? (
          <p className="text-xs text-muted-foreground">
            Shown as <s>{toMajor(toMinor(compareAt))}</s> {toMajor(toMinor(amount) || 0)} on the pricing
            page.{" "}
            {saleEndsAt
              ? `The strikethrough disappears after ${saleEndsAt}; anyone who subscribed at the sale price keeps it.`
              : "With no end date the sale runs until you change the price."}
          </p>
        ) : null}

        {savingPct !== null && yearlyFull ? (
          <p className="text-xs text-muted-foreground">
            {toMajor(yearlyFull)} at the monthly rate — this is {savingPct}% off, about{" "}
            {(((yearlyFull - typedMinor) / yearlyFull) * 12).toFixed(1)} months free.
          </p>
        ) : null}

        <PriceHistory
          prices={plan.prices.filter((p) => p.currency === currency && p.interval === interval)}
          onMigrate={migrate}
        />
      </CardContent>
    </Card>
  );
}
