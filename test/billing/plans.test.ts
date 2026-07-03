import { describe, it, expect, afterEach, vi } from "vitest";
import {
  PLANS,
  PAID_TIERS,
  planFor,
  isPaidTier,
  stripePriceIdForTier,
  tierForStripePrice,
} from "@/lib/billing/plans";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("plan metadata", () => {
  it("has exactly the four tiers in display order", () => {
    expect(PLANS.map((p) => p.tier)).toEqual(["free", "creator", "pro", "studio"]);
  });

  it("free has no Stripe price env; paid tiers each name one", () => {
    expect(planFor("free").priceEnv).toBe("");
    expect(planFor("creator").priceEnv).toBe("STRIPE_PRICE_CREATOR");
    expect(planFor("pro").priceEnv).toBe("STRIPE_PRICE_PRO");
    expect(planFor("studio").priceEnv).toBe("STRIPE_PRICE_STUDIO");
  });

  it("planFor falls back to the free plan for an unknown tier", () => {
    // @ts-expect-error deliberately passing an invalid tier
    expect(planFor("mystery")).toBe(PLANS[0]);
  });
});

describe("isPaidTier", () => {
  it("classifies tiers correctly", () => {
    expect(isPaidTier("free")).toBe(false);
    expect(PAID_TIERS.every(isPaidTier)).toBe(true);
    expect(isPaidTier("creator")).toBe(true);
    expect(isPaidTier("studio")).toBe(true);
  });
});

describe("stripePriceIdForTier", () => {
  it("returns null for free (no price env)", () => {
    expect(stripePriceIdForTier("free")).toBeNull();
  });

  it("returns null when the env var is unset", () => {
    vi.stubEnv("STRIPE_PRICE_PRO", "");
    expect(stripePriceIdForTier("pro")).toBeNull();
  });

  it("reads the configured price id (trimmed)", () => {
    vi.stubEnv("STRIPE_PRICE_PRO", "  price_pro_123  ");
    expect(stripePriceIdForTier("pro")).toBe("price_pro_123");
  });
});

describe("tierForStripePrice — webhook reverse lookup (mis-assign guard)", () => {
  it("maps a known price id back to its tier", () => {
    vi.stubEnv("STRIPE_PRICE_CREATOR", "price_creator");
    vi.stubEnv("STRIPE_PRICE_PRO", "price_pro");
    vi.stubEnv("STRIPE_PRICE_STUDIO", "price_studio");
    expect(tierForStripePrice("price_creator")).toBe("creator");
    expect(tierForStripePrice("price_pro")).toBe("pro");
    expect(tierForStripePrice("price_studio")).toBe("studio");
  });

  it("returns null for an unknown/legacy price rather than guessing a tier", () => {
    vi.stubEnv("STRIPE_PRICE_CREATOR", "price_creator");
    vi.stubEnv("STRIPE_PRICE_PRO", "price_pro");
    vi.stubEnv("STRIPE_PRICE_STUDIO", "price_studio");
    expect(tierForStripePrice("price_removed_plan")).toBeNull();
  });

  it("does not match on an unset env (empty string must not collide)", () => {
    vi.stubEnv("STRIPE_PRICE_CREATOR", "");
    vi.stubEnv("STRIPE_PRICE_PRO", "");
    vi.stubEnv("STRIPE_PRICE_STUDIO", "");
    // An empty incoming id must not accidentally resolve to a tier.
    expect(tierForStripePrice("")).toBeNull();
  });
});
