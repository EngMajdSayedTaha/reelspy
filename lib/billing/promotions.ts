// Promo codes: Stripe coupons + promotion codes, created and retired from the
// admin console.
//
// Stripe stays the source of truth for redemption — it is what actually
// validates a code at checkout and counts uses. `plan_promotions` is a mirror so
// the admin list is one query rather than N Stripe calls, so a promo can be
// restricted to specific plans, and so a retired promo is still auditable.
//
// The Stripe parameter builders are pure and exported, because everything
// interesting about a promo (percent vs amount, how long it lasts, what it
// applies to, who may use it) is decided in how those objects are shaped.

import "server-only";
import type Stripe from "stripe";
import type { Currency } from "@/lib/billing/currency";

export type PromotionInput = {
  code: string;
  /** Exactly one of these two. */
  percentOff?: number | null;
  amountOff?: number | null;
  /** Required with amountOff — Stripe amount-off coupons are single-currency. */
  amountOffCurrency?: Currency | null;
  duration: "once" | "repeating" | "forever";
  durationInMonths?: number | null;
  maxRedemptions?: number | null;
  redeemBy?: string | null;
  firstTimeOnly?: boolean;
  minimumAmount?: number | null;
  minimumAmountCurrency?: Currency | null;
  /** Stripe Product ids to restrict to. Empty means every plan. */
  productIds?: string[];
};

export type PromotionValidation = { ok: true } | { ok: false; error: string };

export function validatePromotionInput(input: PromotionInput): PromotionValidation {
  const hasPercent = input.percentOff != null;
  const hasAmount = input.amountOff != null;

  if (hasPercent === hasAmount) {
    return { ok: false, error: "Choose either a percentage off or a fixed amount off, not both." };
  }
  if (hasPercent && (input.percentOff! <= 0 || input.percentOff! > 100)) {
    return { ok: false, error: "A percentage discount has to be between 1 and 100." };
  }
  if (hasAmount) {
    if (input.amountOff! <= 0) {
      return { ok: false, error: "A fixed discount has to be greater than zero." };
    }
    // Stripe amount-off coupons carry ONE currency, so an amount-off promo can
    // only ever apply to prices in that currency. Percent-off has no such limit,
    // which is why it's the right default for a multi-currency catalog.
    if (!input.amountOffCurrency) {
      return {
        ok: false,
        error: "A fixed discount applies to one currency only — pick which. Use a percentage to cover all of them.",
      };
    }
  }
  if (input.duration === "repeating" && !(input.durationInMonths && input.durationInMonths > 0)) {
    return { ok: false, error: "A repeating discount needs the number of months it lasts." };
  }
  if (input.duration !== "repeating" && input.durationInMonths) {
    return { ok: false, error: "Only a repeating discount lasts a set number of months." };
  }
  if (input.maxRedemptions != null && input.maxRedemptions <= 0) {
    return { ok: false, error: "A redemption limit has to be at least 1." };
  }
  if (!/^[A-Z0-9_-]{3,40}$/i.test(input.code)) {
    return { ok: false, error: "Codes are 3–40 characters: letters, digits, - and _." };
  }
  return { ok: true };
}

export function buildCouponParams(input: PromotionInput): Stripe.CouponCreateParams {
  return {
    name: input.code.toUpperCase(),
    duration: input.duration,
    ...(input.percentOff != null ? { percent_off: input.percentOff } : {}),
    ...(input.amountOff != null
      ? { amount_off: input.amountOff, currency: input.amountOffCurrency ?? undefined }
      : {}),
    ...(input.duration === "repeating" && input.durationInMonths
      ? { duration_in_months: input.durationInMonths }
      : {}),
    ...(input.maxRedemptions ? { max_redemptions: input.maxRedemptions } : {}),
    ...(input.redeemBy ? { redeem_by: Math.floor(new Date(input.redeemBy).getTime() / 1000) } : {}),
    // PRODUCT ids, not price ids — which is why every plan carries a Stripe
    // Product. Restricting by product means the promo survives a price change.
    ...(input.productIds && input.productIds.length > 0
      ? { applies_to: { products: input.productIds } }
      : {}),
  };
}

export function buildPromotionCodeParams(
  couponId: string,
  input: PromotionInput
): Stripe.PromotionCodeCreateParams {
  const restrictions: Stripe.PromotionCodeCreateParams.Restrictions = {};
  if (input.firstTimeOnly) restrictions.first_time_transaction = true;
  if (input.minimumAmount != null) {
    restrictions.minimum_amount = input.minimumAmount;
    restrictions.minimum_amount_currency = input.minimumAmountCurrency ?? undefined;
  }

  return {
    coupon: couponId,
    code: input.code.toUpperCase(),
    ...(input.redeemBy ? { expires_at: Math.floor(new Date(input.redeemBy).getTime() / 1000) } : {}),
    ...(Object.keys(restrictions).length > 0 ? { restrictions } : {}),
  };
}
