import { describe, it, expect, afterEach, vi } from "vitest";
import type Stripe from "stripe";
import { decidePlanChangeMode } from "@/lib/billing/plan-change";

// Which way a plan change goes — applied now with a prorated charge, or booked
// for the next renewal — is a MONEY decision, so it's made from the real Stripe
// amounts rather than the order of the cards on the pricing page. These pin that
// rule, including the direction it falls when Stripe can't tell us.

afterEach(() => {
  vi.unstubAllEnvs();
});

function subAt(unitAmount: number | null, currency: string | null = "aed"): Stripe.Subscription {
  return {
    id: "sub_1",
    items: { data: [{ id: "si_1", price: unitAmount === null ? {} : { unit_amount: unitAmount, currency } }] },
  } as unknown as Stripe.Subscription;
}

const target = (tier: string, unitAmount: number | null, currency: string | null = "aed") =>
  ({ tier, unitAmount, currency }) as Parameters<typeof decidePlanChangeMode>[2];

describe("decidePlanChangeMode", () => {
  it("applies a costlier plan immediately", () => {
    // Creator 49 → Pro 149.
    expect(decidePlanChangeMode(subAt(4900), "creator", target("pro", 14900))).toEqual({
      immediate: true,
      direction: "upgrade",
    });
  });

  it("defers a cheaper plan to the renewal", () => {
    expect(decidePlanChangeMode(subAt(34900), "studio", target("creator", 4900))).toEqual({
      immediate: false,
      direction: "downgrade",
    });
  });

  it("defers a same-price change — there's nothing to charge for", () => {
    expect(decidePlanChangeMode(subAt(14900), "pro", target("custom", 14900))).toEqual({
      immediate: false,
      direction: "change",
    });
  });

  // The plan ladder can't rank a custom plan; its price can. This is the case
  // the ladder would get wrong in both directions.
  it("ranks a custom plan by what it actually costs", () => {
    expect(decidePlanChangeMode(subAt(4900), "creator", target("custom", 21000))).toMatchObject({
      immediate: true,
      direction: "upgrade",
    });
    expect(decidePlanChangeMode(subAt(21000), "custom", target("creator", 4900))).toMatchObject({
      immediate: false,
      direction: "downgrade",
    });
  });

  it("falls back to the plan ladder when Stripe's amounts aren't comparable", () => {
    vi.stubEnv("STRIPE_PRICE_PRO", "price_pro");
    // Missing amount on the current subscription…
    expect(decidePlanChangeMode(subAt(null), "creator", target("pro", 14900))).toEqual({
      immediate: true,
      direction: "upgrade",
    });
    // …and a currency mismatch, which would make a numeric comparison nonsense.
    expect(decidePlanChangeMode(subAt(4900, "aed"), "studio", target("creator", 4000, "usd"))).toEqual({
      immediate: false,
      direction: "downgrade",
    });
  });

  it("defers rather than charges when nothing can be ranked at all", () => {
    // Custom is off the ladder and the amounts are unknown: never guess in the
    // direction that takes money.
    expect(decidePlanChangeMode(subAt(null), "custom", target("custom", null))).toEqual({
      immediate: false,
      direction: "change",
    });
  });
});
