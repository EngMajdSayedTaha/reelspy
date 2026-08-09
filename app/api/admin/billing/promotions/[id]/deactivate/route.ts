import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { guardAdminMutation } from "@/lib/admin/mutation";
import { writeAudit } from "@/lib/admin/audit";
import { getStripe } from "@/lib/billing/stripe";

export const runtime = "nodejs";

// Retire a promo code by DEACTIVATING it, never deleting it.
//
// Deactivating a promotion code stops new redemptions while leaving every
// customer who already used it on their discount — which is what "stop offering
// this code" should mean. Deleting the coupon would be a different, larger
// action, and it would take the record with it.
//
// Reversible on purpose: a code turned off by mistake can be turned back on.

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { admin, user, ip, userAgent } = gate.ctx;
  const { id } = await params;

  const over = await guardAdminMutation(gate.ctx);
  if (over) return over;

  const { data: row } = await admin
    .from("plan_promotions")
    .select("id, code, stripe_promotion_code_id, active")
    .eq("id", id)
    .maybeSingle();

  if (!row) return NextResponse.json({ error: "Promotion not found." }, { status: 404 });

  const next = !row.active;
  const stripe = getStripe();
  if (stripe && row.stripe_promotion_code_id) {
    try {
      await stripe.promotionCodes.update(row.stripe_promotion_code_id as string, { active: next });
    } catch (err) {
      return NextResponse.json(
        { error: `Stripe wouldn't update the code: ${err instanceof Error ? err.message : "unknown error"}` },
        { status: 502 }
      );
    }
  }

  await admin
    .from("plan_promotions")
    .update({ active: next, last_synced_at: new Date().toISOString() })
    .eq("id", id);

  await writeAudit(admin, {
    adminId: user.id,
    action: next ? "billing.promotion.reactivate" : "billing.promotion.deactivate",
    targetType: "promotion",
    targetId: id,
    payload: { code: row.code },
    ip,
    userAgent,
  });

  return NextResponse.json({ ok: true, active: next });
}
