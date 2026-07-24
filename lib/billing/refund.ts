import "server-only";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

// Admin-initiated refund (payment hardening). Refunds the most recent payment on
// a user's subscription. It reports whether the refund was FULL so the caller can
// message the admin, but it does NOT itself cancel the subscription, write the
// subscriptions table, or email the customer.
//
// All of those side effects are owned by the signature-verified webhook: the
// `charge.refunded` event it emits applies the founder's policy (full refund →
// cancel the sub immediately → drop to Free) and sends the customer emails. Doing
// it there instead of here means a refund issued from the STRIPE DASHBOARD behaves
// identically to one issued from the admin UI — one policy, one code path, no
// double cancel or double email.

export type RefundResult = {
  ok: boolean;
  reason?: string;
  refundId?: string;
  amountRefunded?: number; // minor units
  currency?: string;
  full?: boolean;
};

// Pull the PaymentIntent id + charged amount from a subscription's latest invoice.
function latestPaymentOf(sub: Stripe.Subscription): {
  paymentIntentId: string | null;
  chargedAmount: number | null;
  currency: string | null;
} {
  const invoice = sub.latest_invoice;
  if (!invoice || typeof invoice === "string") {
    return { paymentIntentId: null, chargedAmount: null, currency: null };
  }
  const pi = invoice.payment_intent;
  const paymentIntentId = pi ? (typeof pi === "string" ? pi : pi.id) : null;
  return {
    paymentIntentId,
    chargedAmount: invoice.amount_paid ?? null,
    currency: invoice.currency ?? null,
  };
}

// Refund the latest payment for `userId`'s subscription. `amount` (minor units,
// optional) refunds a partial amount; omitted = full refund. A full refund also
// cancels the subscription immediately.
export async function refundUserSubscription(
  admin: SupabaseClient,
  stripe: Stripe,
  userId: string,
  amount?: number
): Promise<RefundResult> {
  const { data: row } = await admin
    .from("subscriptions")
    .select("stripe_subscription_id, stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();

  const subId = row?.stripe_subscription_id as string | null | undefined;
  if (!subId) {
    return { ok: false, reason: "No Stripe subscription on file for this user." };
  }

  let sub: Stripe.Subscription;
  try {
    sub = await stripe.subscriptions.retrieve(subId, {
      expand: ["latest_invoice.payment_intent"],
    });
  } catch (err) {
    return { ok: false, reason: `Couldn't load the subscription from Stripe: ${errMsg(err)}` };
  }

  const { paymentIntentId, chargedAmount } = latestPaymentOf(sub);
  if (!paymentIntentId) {
    return { ok: false, reason: "No captured payment found to refund (no paid invoice yet)." };
  }

  // A refund with no amount, or one that covers the whole charge, is FULL — the
  // webhook's charge.refunded handler cancels the sub in that case.
  const isFull = amount == null || (chargedAmount != null && amount >= chargedAmount);

  let refund: Stripe.Refund;
  try {
    refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      ...(amount != null ? { amount } : {}),
      metadata: { user_id: userId, initiated_by: "admin" },
    });
  } catch (err) {
    return { ok: false, reason: `Stripe refund failed: ${errMsg(err)}` };
  }

  return {
    ok: true,
    refundId: refund.id,
    amountRefunded: refund.amount,
    currency: refund.currency,
    full: isFull,
  };
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : "unknown error";
}
