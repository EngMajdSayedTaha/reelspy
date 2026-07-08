// Plan presentation + Stripe price wiring (L6 / B1). Maps each tier to its
// Stripe Price id (from env, so prices can change without a deploy) and the
// marketing copy the /dashboard/billing page renders. Entitlement numbers live
// in entitlements.ts; this file is about money + display only.
//
// Prices are indicative monthly AED — the amount actually charged is whatever
// the Stripe Price is configured for; the label here is just what we show.

import type { AiTier } from "@/lib/ai/tier";

export type PaidTier = Exclude<AiTier, "free">;

export type PlanMeta = {
  tier: AiTier;
  name: string;
  tagline: string;
  /** Indicative monthly price in AED (display only; Stripe is the real source). */
  priceAed: number;
  /** Env var holding this tier's Stripe Price id. */
  priceEnv: string;
  /** Short bullets for the pricing card. */
  highlights: string[];
};

// Order matters: drives column order on the billing page.
export const PLANS: PlanMeta[] = [
  {
    tier: "free",
    name: "Free",
    tagline: "Try the workflow",
    priceAed: 0,
    priceEnv: "",
    highlights: ["3 tracked accounts", "10 scripts / month", "Caption-only AI"],
  },
  {
    tier: "creator",
    name: "Creator",
    tagline: "Solo operators",
    priceAed: 49,
    priceEnv: "STRIPE_PRICE_CREATOR",
    highlights: ["30 tracked accounts", "60 scripts / month", "Claude Sonnet scripts", "15 auto-replies"],
  },
  {
    tier: "pro",
    name: "Pro",
    tagline: "Serious creators & SMMs",
    priceAed: 149,
    priceEnv: "STRIPE_PRICE_PRO",
    highlights: ["50 tracked accounts", "200 scripts / month", "Claude Opus scripts", "30 auto-replies", "4 publish targets"],
  },
  {
    tier: "studio",
    name: "Studio",
    tagline: "Agencies & teams",
    priceAed: 349,
    priceEnv: "STRIPE_PRICE_STUDIO",
    highlights: ["100 tracked accounts", "Unlimited scripts", "Claude Opus scripts", "60 auto-replies", "4 publish targets"],
  },
];

export const PAID_TIERS: PaidTier[] = ["creator", "pro", "studio"];

export function planFor(tier: AiTier): PlanMeta {
  return PLANS.find((p) => p.tier === tier) ?? PLANS[0];
}

export function isPaidTier(tier: AiTier): tier is PaidTier {
  return tier === "creator" || tier === "pro" || tier === "studio" || tier === "custom";
}

// The Stripe Price id configured for a paid tier, or null when the env var is
// unset (Stripe not wired yet / tier not sold). Free has no price.
export function stripePriceIdForTier(tier: AiTier): string | null {
  const meta = planFor(tier);
  if (!meta.priceEnv) return null;
  return process.env[meta.priceEnv]?.trim() || null;
}

// Reverse lookup used by the webhook: which tier does this Stripe Price id sell?
// Returns null for an unknown price (e.g. a legacy/removed plan) so the webhook
// can log and skip rather than mis-assign a tier.
export function tierForStripePrice(priceId: string): PaidTier | null {
  for (const tier of PAID_TIERS) {
    if (stripePriceIdForTier(tier) === priceId) return tier;
  }
  return null;
}
