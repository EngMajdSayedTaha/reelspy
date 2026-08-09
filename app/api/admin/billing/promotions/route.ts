import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import { guardAdminMutation, parseBody } from "@/lib/admin/mutation";
import { writeAudit } from "@/lib/admin/audit";
import { getStripe } from "@/lib/billing/stripe";
import { CURRENCIES } from "@/lib/billing/currency";
import {
  buildCouponParams,
  buildPromotionCodeParams,
  validatePromotionInput,
  type PromotionInput,
} from "@/lib/billing/promotions";

export const runtime = "nodejs";

// Promo codes.
//
// Stripe validates and counts redemptions; this table mirrors them so the list
// is one query and so a retired code is still auditable. Redemption counts are
// refreshed from Stripe on read, fail-open to the mirrored values — a Stripe
// blip should make the numbers stale, not the page empty.

export type AdminPromotionRow = {
  id: string;
  code: string | null;
  stripeCouponId: string;
  stripePromotionCodeId: string | null;
  percentOff: number | null;
  amountOff: number | null;
  amountOffCurrency: string | null;
  duration: string;
  durationInMonths: number | null;
  maxRedemptions: number | null;
  timesRedeemed: number;
  redeemBy: string | null;
  firstTimeOnly: boolean;
  appliesToPlanIds: string[];
  active: boolean;
  createdAt: string;
};

type PromotionRecord = {
  id: string;
  code: string | null;
  stripe_coupon_id: string;
  stripe_promotion_code_id: string | null;
  percent_off: number | null;
  amount_off: number | null;
  amount_off_currency: string | null;
  duration: string;
  duration_in_months: number | null;
  max_redemptions: number | null;
  times_redeemed: number;
  redeem_by: string | null;
  first_time_only: boolean;
  applies_to_plan_ids: string[];
  active: boolean;
  created_at: string;
};

export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { admin } = gate.ctx;

  const { data, error } = await admin
    .from("plan_promotions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json(
      { error: `Could not read promotions: ${error.message}` },
      { status: 503 }
    );
  }

  const rows = (data ?? []) as PromotionRecord[];
  const stripe = getStripe();

  // Refresh redemption counts for what's on screen. Bounded to this page, and
  // never allowed to fail the request.
  const live = new Map<string, { timesRedeemed: number; active: boolean }>();
  if (stripe) {
    await Promise.all(
      rows
        .filter((r) => r.stripe_promotion_code_id)
        .map(async (r) => {
          try {
            const promo = await stripe.promotionCodes.retrieve(r.stripe_promotion_code_id!);
            live.set(r.id, { timesRedeemed: promo.times_redeemed ?? 0, active: promo.active });
          } catch {
            // Deleted in the dashboard, or Stripe unreachable — keep the mirror.
          }
        })
    );
  }

  const promotions: AdminPromotionRow[] = rows.map((r) => ({
    id: r.id,
    code: r.code,
    stripeCouponId: r.stripe_coupon_id,
    stripePromotionCodeId: r.stripe_promotion_code_id,
    percentOff: r.percent_off,
    amountOff: r.amount_off,
    amountOffCurrency: r.amount_off_currency,
    duration: r.duration,
    durationInMonths: r.duration_in_months,
    maxRedemptions: r.max_redemptions,
    timesRedeemed: live.get(r.id)?.timesRedeemed ?? r.times_redeemed,
    redeemBy: r.redeem_by,
    firstTimeOnly: r.first_time_only,
    appliesToPlanIds: r.applies_to_plan_ids ?? [],
    active: live.get(r.id)?.active ?? r.active,
    createdAt: r.created_at,
  }));

  return NextResponse.json({ promotions });
}

const createSchema = z.object({
  code: z.string().trim().min(3).max(40),
  percentOff: z.number().min(1).max(100).nullable().optional(),
  amountOff: z.number().int().positive().nullable().optional(),
  amountOffCurrency: z.enum(CURRENCIES).nullable().optional(),
  duration: z.enum(["once", "repeating", "forever"]),
  durationInMonths: z.number().int().positive().max(60).nullable().optional(),
  maxRedemptions: z.number().int().positive().nullable().optional(),
  redeemBy: z.string().datetime().nullable().optional(),
  firstTimeOnly: z.boolean().optional(),
  minimumAmount: z.number().int().positive().nullable().optional(),
  minimumAmountCurrency: z.enum(CURRENCIES).nullable().optional(),
  /** Plan ids to restrict to; empty means every plan. */
  planIds: z.array(z.string().uuid()).max(20).optional(),
});

export async function POST(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { admin, user, ip, userAgent } = gate.ctx;

  const over = await guardAdminMutation(gate.ctx);
  if (over) return over;

  const body = await parseBody(request, createSchema);
  if (!body.ok) return body.response;

  const stripe = getStripe();
  if (!stripe) return NextResponse.json({ error: "Stripe isn't configured." }, { status: 503 });

  const planIds = body.data.planIds ?? [];

  // Restriction is by Stripe PRODUCT, which is why each plan carries one — it
  // means the promo survives a price change instead of being orphaned by it.
  let productIds: string[] = [];
  if (planIds.length > 0) {
    const { data: plans } = await admin
      .from("plans")
      .select("id, slug, stripe_product_id")
      .in("id", planIds);
    const rows = (plans ?? []) as { id: string; slug: string; stripe_product_id: string | null }[];
    const missing = rows.filter((p) => !p.stripe_product_id);
    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: `These plans have no Stripe product yet, so a promo can't be restricted to them: ${missing
            .map((p) => p.slug)
            .join(", ")}. Set a price on them first.`,
        },
        { status: 409 }
      );
    }
    productIds = rows.map((p) => p.stripe_product_id!);
  }

  const input: PromotionInput = { ...body.data, productIds };
  const valid = validatePromotionInput(input);
  if (!valid.ok) return NextResponse.json({ error: valid.error }, { status: 400 });

  let couponId: string;
  let promotionCodeId: string;
  try {
    const coupon = await stripe.coupons.create(buildCouponParams(input));
    couponId = coupon.id;
    const promo = await stripe.promotionCodes.create(buildPromotionCodeParams(coupon.id, input));
    promotionCodeId = promo.id;
  } catch (err) {
    return NextResponse.json(
      { error: `Stripe rejected the promotion: ${err instanceof Error ? err.message : "unknown error"}` },
      { status: 502 }
    );
  }

  const { error } = await admin.from("plan_promotions").insert({
    stripe_coupon_id: couponId,
    stripe_promotion_code_id: promotionCodeId,
    code: input.code.toUpperCase(),
    percent_off: input.percentOff ?? null,
    amount_off: input.amountOff ?? null,
    amount_off_currency: input.amountOffCurrency ?? null,
    duration: input.duration,
    duration_in_months: input.durationInMonths ?? null,
    max_redemptions: input.maxRedemptions ?? null,
    redeem_by: input.redeemBy ?? null,
    first_time_only: input.firstTimeOnly ?? false,
    minimum_amount: input.minimumAmount ?? null,
    minimum_amount_currency: input.minimumAmountCurrency ?? null,
    applies_to_plan_ids: planIds,
    active: true,
    created_by: user.id,
    last_synced_at: new Date().toISOString(),
  });

  if (error) {
    // The code exists and works in Stripe; only our mirror is missing. Say so
    // rather than implying nothing happened.
    console.error("[admin/promotions] mirror insert failed:", error.message);
    return NextResponse.json(
      {
        error: `Created "${input.code.toUpperCase()}" in Stripe, but couldn't record it here: ${error.message}`,
      },
      { status: 500 }
    );
  }

  await writeAudit(admin, {
    adminId: user.id,
    action: "billing.promotion.create",
    targetType: "promotion",
    targetId: promotionCodeId,
    payload: { code: input.code.toUpperCase(), couponId, planIds },
    ip,
    userAgent,
  });

  return NextResponse.json({ ok: true, code: input.code.toUpperCase(), promotionCodeId });
}
