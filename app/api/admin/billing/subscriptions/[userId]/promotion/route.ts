import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import { guardAdminMutation, parseBody } from "@/lib/admin/mutation";
import { writeAudit } from "@/lib/admin/audit";
import { getStripe } from "@/lib/billing/stripe";

export const runtime = "nodejs";

// Apply a promo code to an EXISTING subscriber — a retention or support offer.
//
// Deliberately admin-only. A customer-facing promo box on the upgrade path would
// force previewProration to model the discount and decidePlanChangeMode to
// reason about discounted amounts, which is exactly the trap that choosing
// price-swap sales over coupons avoids: a discount could make a nominal upgrade
// bill less than the current plan and get deferred as a downgrade. Promo codes
// stay where they're safe — first-purchase Checkout — plus this.

const bodySchema = z.object({ code: z.string().trim().min(3).max(40) });

export async function POST(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { admin, user, ip, userAgent } = gate.ctx;
  const { userId } = await params;

  const over = await guardAdminMutation(gate.ctx);
  if (over) return over;

  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.response;
  const code = body.data.code.toUpperCase();

  const stripe = getStripe();
  if (!stripe) return NextResponse.json({ error: "Stripe isn't configured." }, { status: 503 });

  const { data: row } = await admin
    .from("subscriptions")
    .select("stripe_subscription_id, status")
    .eq("user_id", userId)
    .maybeSingle();

  const subscriptionId = row?.stripe_subscription_id as string | null | undefined;
  if (!subscriptionId) {
    return NextResponse.json(
      { error: "This user has no live Stripe subscription to apply a code to." },
      { status: 409 }
    );
  }

  try {
    // Resolve the code to its promotion-code id: subscriptions.update takes the
    // id, not the customer-facing string.
    const found = await stripe.promotionCodes.list({ code, active: true, limit: 1 });
    const promo = found.data[0];
    if (!promo) {
      return NextResponse.json({ error: `No active promo code called "${code}".` }, { status: 404 });
    }

    await stripe.subscriptions.update(subscriptionId, { discounts: [{ promotion_code: promo.id }] });

    await writeAudit(admin, {
      adminId: user.id,
      action: "billing.promotion.apply",
      targetType: "subscription",
      targetId: userId,
      payload: { code, promotionCodeId: promo.id, subscriptionId },
      ip,
      userAgent,
    });

    return NextResponse.json({ ok: true, code });
  } catch (err) {
    return NextResponse.json(
      { error: `Stripe wouldn't apply the code: ${err instanceof Error ? err.message : "unknown error"}` },
      { status: 502 }
    );
  }
}
