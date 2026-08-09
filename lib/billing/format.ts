// Shared billing formatting so a date or a price reads the same in an email, in
// an API response and on the billing page. No "server-only" marker: the price
// helper is imported by the client-side confirmation dialogs too.

import { PLANS, planFor } from "@/lib/billing/plans";
import type { AiTier } from "@/lib/ai/tier";

export type PlanChangeDirection = "upgrade" | "downgrade" | "change";

// The default ordering of tiers, cheapest first. Only a fallback: callers that
// can resolve the live plan ordering should pass their own ladder, because once
// plans are admin-managed the hardcoded PLANS array is no longer the truth.
export const FALLBACK_PLAN_LADDER: AiTier[] = PLANS.map((p) => p.tier);

// Whether moving between two tiers reads as an upgrade or a downgrade — used for
// button labels and email wording only, never for pricing. A tier that isn't on
// the ladder (notably "custom", whose price depends on the configuration) makes
// the move unrankable, and is described neutrally as a change.
//
// The ladder is a parameter rather than a module import so this file stays pure
// and client-safe: it's imported by the confirmation dialogs in
// components/billing/BillingActions.tsx, which can never reach the database.
// The server resolves the real ordering and passes it down.
export function planChangeDirection(
  from: AiTier,
  to: AiTier,
  ladder: readonly AiTier[] = FALLBACK_PLAN_LADDER
): PlanChangeDirection {
  const a = ladder.indexOf(from);
  const b = ladder.indexOf(to);
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
