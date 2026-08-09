import { describe, it, expect } from "vitest";
import {
  buildCouponParams,
  buildPromotionCodeParams,
  validatePromotionInput,
  type PromotionInput,
} from "@/lib/billing/promotions";

// Everything interesting about a promo is decided in the shape of the Stripe
// objects it creates: percent vs amount, how long the discount lasts, what it
// applies to, and who may use it. These are pure builders precisely so that is
// testable without a Stripe client.

const base: PromotionInput = {
  code: "LAUNCH20",
  percentOff: 20,
  duration: "once",
};

describe("validatePromotionInput", () => {
  it("requires exactly one kind of discount", () => {
    expect(validatePromotionInput({ ...base, amountOff: 5000 }).ok).toBe(false);
    expect(validatePromotionInput({ code: "X1", duration: "once" }).ok).toBe(false);
    expect(validatePromotionInput(base).ok).toBe(true);
  });

  // Stripe amount-off coupons carry ONE currency, so a fixed discount can only
  // ever apply to prices in that currency. Silently minting three coupons would
  // be worse than making the admin choose.
  it("makes a fixed discount name its currency", () => {
    expect(
      validatePromotionInput({ code: "FLAT50", amountOff: 5000, duration: "once" }).ok
    ).toBe(false);
    expect(
      validatePromotionInput({
        code: "FLAT50",
        amountOff: 5000,
        amountOffCurrency: "aed",
        duration: "once",
      }).ok
    ).toBe(true);
  });

  it("keeps duration and months consistent", () => {
    expect(validatePromotionInput({ ...base, duration: "repeating" }).ok).toBe(false);
    expect(validatePromotionInput({ ...base, duration: "repeating", durationInMonths: 3 }).ok).toBe(true);
    expect(validatePromotionInput({ ...base, duration: "forever", durationInMonths: 3 }).ok).toBe(false);
  });

  it("bounds the percentage and rejects unusable codes", () => {
    expect(validatePromotionInput({ ...base, percentOff: 0 }).ok).toBe(false);
    expect(validatePromotionInput({ ...base, percentOff: 101 }).ok).toBe(false);
    expect(validatePromotionInput({ ...base, code: "AB" }).ok).toBe(false);
    expect(validatePromotionInput({ ...base, code: "HAS SPACE" }).ok).toBe(false);
  });
});

describe("buildCouponParams", () => {
  it("builds a percent-off coupon", () => {
    expect(buildCouponParams(base)).toMatchObject({ percent_off: 20, duration: "once" });
  });

  it("builds an amount-off coupon with its currency", () => {
    expect(
      buildCouponParams({ code: "FLAT50", amountOff: 5000, amountOffCurrency: "sar", duration: "forever" })
    ).toMatchObject({ amount_off: 5000, currency: "sar", duration: "forever" });
  });

  it("carries duration_in_months only when repeating", () => {
    expect(
      buildCouponParams({ ...base, duration: "repeating", durationInMonths: 3 })
    ).toMatchObject({ duration_in_months: 3 });
    expect(buildCouponParams(base)).not.toHaveProperty("duration_in_months");
  });

  // Restriction is by PRODUCT, not price — which is what lets a promo survive a
  // price change instead of being orphaned by the new Price id.
  it("restricts by product id, and omits the restriction entirely when unscoped", () => {
    expect(buildCouponParams({ ...base, productIds: ["prod_pro"] })).toMatchObject({
      applies_to: { products: ["prod_pro"] },
    });
    expect(buildCouponParams({ ...base, productIds: [] })).not.toHaveProperty("applies_to");
  });

  it("converts redeemBy to Stripe's unix seconds", () => {
    const params = buildCouponParams({ ...base, redeemBy: "2026-12-31T00:00:00Z" });
    expect(params.redeem_by).toBe(Math.floor(Date.parse("2026-12-31T00:00:00Z") / 1000));
  });
});

describe("buildPromotionCodeParams", () => {
  it("upper-cases the customer-facing code", () => {
    expect(buildPromotionCodeParams("coupon_1", { ...base, code: "launch20" })).toMatchObject({
      coupon: "coupon_1",
      code: "LAUNCH20",
    });
  });

  it("adds restrictions only when there are some", () => {
    expect(buildPromotionCodeParams("coupon_1", base)).not.toHaveProperty("restrictions");
    expect(
      buildPromotionCodeParams("coupon_1", { ...base, firstTimeOnly: true })
    ).toMatchObject({ restrictions: { first_time_transaction: true } });
    expect(
      buildPromotionCodeParams("coupon_1", {
        ...base,
        minimumAmount: 10000,
        minimumAmountCurrency: "aed",
      })
    ).toMatchObject({ restrictions: { minimum_amount: 10000, minimum_amount_currency: "aed" } });
  });
});
