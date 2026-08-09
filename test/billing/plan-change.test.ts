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

function subAt(
  unitAmount: number | null,
  currency: string | null = "aed",
  interval: "month" | "year" = "month"
): Stripe.Subscription {
  return {
    id: "sub_1",
    items: {
      data: [
        {
          id: "si_1",
          price:
            unitAmount === null ? {} : { unit_amount: unitAmount, currency, recurring: { interval } },
        },
      ],
    },
  } as unknown as Stripe.Subscription;
}

const target = (
  tier: string,
  unitAmount: number | null,
  currency: string | null = "aed",
  interval: "month" | "year" = "month"
) => ({ tier, unitAmount, currency, interval }) as Parameters<typeof decidePlanChangeMode>[2];

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

// Annual prices are bigger NUMBERS without being bigger commitments per month.
// Comparing them raw would charge somebody for downgrading, so the comparison is
// cross-multiplied to a monthly equivalent.
describe("decidePlanChangeMode across billing intervals", () => {
  it("does not mistake a cheap annual plan for an upgrade from a pricier monthly one", () => {
    // Studio 349/mo → Creator 490/yr (40.83/mo). The raw numbers say "up".
    expect(
      decidePlanChangeMode(subAt(34900), "studio", target("creator", 49000, "aed", "year"))
    ).toEqual({ immediate: false, direction: "downgrade" });
  });

  it("treats a pricier annual plan as an upgrade and applies it now", () => {
    // Creator 49/mo → Pro 1490/yr (124.17/mo).
    expect(decidePlanChangeMode(subAt(4900), "creator", target("pro", 149000, "aed", "year"))).toEqual({
      immediate: true,
      direction: "upgrade",
    });
  });

  it("charges now for switching the same plan to annual — they pre-pay for longer", () => {
    // Pro 149/mo → Pro 1788/yr, exactly 12x: same per month, longer commitment.
    expect(decidePlanChangeMode(subAt(14900), "pro", target("pro", 178800, "aed", "year"))).toEqual({
      immediate: true,
      direction: "upgrade",
    });
  });

  it("defers annual → monthly to the renewal, which can be a year out", () => {
    // They paid for the year; nothing is taken away early.
    expect(
      decidePlanChangeMode(subAt(178800, "aed", "year"), "pro", target("pro", 14900, "aed", "month"))
    ).toEqual({ immediate: false, direction: "downgrade" });
  });

  it("still defers a genuinely identical price on the same interval", () => {
    expect(decidePlanChangeMode(subAt(14900), "pro", target("pro", 14900))).toEqual({
      immediate: false,
      direction: "change",
    });
  });

  // Cross-multiplying rather than dividing: 14900/mo vs 178801/yr differ by one
  // fils a year, and integer division would round them into looking equal.
  it("does not round two nearly-equal prices into a tie", () => {
    expect(
      decidePlanChangeMode(subAt(14900), "pro", target("pro", 178801, "aed", "year")).direction
    ).toBe("upgrade");
  });
});
