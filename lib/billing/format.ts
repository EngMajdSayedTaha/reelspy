// Shared billing formatting so a date or a price reads the same in an email, in
// an API response and on the billing page. No "server-only" marker: the price
// helper is imported by the client-side confirmation dialogs too.

import { PLANS, planFor } from "@/lib/billing/plans";
import type { AiTier } from "@/lib/ai/tier";

export type PlanChangeDirection = "upgrade" | "downgrade" | "change";

// Whether moving between two tiers reads as an upgrade or a downgrade — used for
// button labels and email wording only, never for pricing. "custom" isn't on the
// ladder (its price depends on the configuration), so any move involving it is
// described neutrally as a change.
export function planChangeDirection(from: AiTier, to: AiTier): PlanChangeDirection {
  const a = PLANS.findIndex((p) => p.tier === from);
  const b = PLANS.findIndex((p) => p.tier === to);
  if (a === -1 || b === -1 || a === b) return "change";
  return b > a ? "upgrade" : "downgrade";
}

// "Aug 29, 2026" — the one date format every billing surface uses.
export function dayLabel(value: string | number | Date | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

// Unix seconds (Stripe's currency for timestamps) → the same label.
export function dayLabelFromUnix(unix: number | null | undefined): string | null {
  if (!unix) return null;
  return dayLabel(new Date(unix * 1000));
}

// "AED 149" — indicative monthly price of a tier, or of a custom config when the
// amount is known. Null for Free (nothing to show).
export function planPriceLabel(tier: AiTier, customPriceAed?: number | null): string | null {
  const aed = tier === "custom" ? customPriceAed ?? null : planFor(tier).priceAed;
  if (!aed) return null;
  return `AED ${aed}`;
}
