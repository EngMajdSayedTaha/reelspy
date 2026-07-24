import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import { guardAdminMutation, parseBody } from "@/lib/admin/mutation";
import { writeAudit } from "@/lib/admin/audit";
import { getStripe } from "@/lib/billing/stripe";
import { refundUserSubscription } from "@/lib/billing/refund";
import { formatMoney } from "@/lib/email/billing";

export const runtime = "nodejs";

// POST /api/admin/billing/subscriptions/[userId]/refund — refund the user's most
// recent subscription payment. Body { amount? } in MINOR units (fils/cents);
// omit for a full refund. A full refund cancels the subscription (handled by the
// charge.refunded webhook, so a dashboard-initiated refund behaves identically).
//
// This route only ISSUES the refund via Stripe + writes the admin audit. The
// customer email + tier downgrade flow through the webhook, the single source of
// truth for billing state.
const bodySchema = z.object({
  // Positive integer minor-unit amount for a partial refund; omit = full.
  amount: z.number().int().positive().optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { admin, user, ip, userAgent } = gate.ctx;
  const { userId } = await params;

  const over = await guardAdminMutation(gate.ctx);
  if (over) return over;

  const parsed = await parseBody(request, bodySchema);
  if (!parsed.ok) return parsed.response;

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "Stripe isn't configured." }, { status: 503 });
  }

  let result: Awaited<ReturnType<typeof refundUserSubscription>>;
  try {
    result = await refundUserSubscription(admin, stripe, userId, parsed.data.amount);
  } catch (err) {
    return NextResponse.json(
      { error: `Refund failed: ${err instanceof Error ? err.message : "unknown error"}` },
      { status: 502 }
    );
  }

  if (!result.ok) {
    return NextResponse.json({ error: result.reason ?? "Refund failed." }, { status: 400 });
  }

  const amountLabel = formatMoney(result.amountRefunded, result.currency);

  await writeAudit(admin, {
    adminId: user.id,
    action: "billing.refund",
    targetType: "subscription",
    targetId: userId,
    payload: {
      refundId: result.refundId,
      amount: result.amountRefunded,
      currency: result.currency,
      full: result.full,
    },
    ip,
    userAgent,
  });

  return NextResponse.json({
    ok: true,
    refundId: result.refundId,
    amountLabel,
    full: result.full,
  });
}
