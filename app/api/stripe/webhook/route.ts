import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/billing/stripe";
import { tierForStripePrice } from "@/lib/billing/plans";
import { isAiTier, type AiTier } from "@/lib/ai/tier";

// Stripe webhook (L6 / B1) — the SOLE writer of the subscriptions table. Every
// request is signature-verified against STRIPE_WEBHOOK_SECRET before we trust a
// byte of it; an unverified/forged call is rejected 400. On the subscription
// lifecycle events we recompute the user's tier from the priced plan and upsert
// it, so entitlements + AI routing follow Stripe as the source of truth.
//
// Needs the raw request body for signature verification, so this must stay on
// the Node runtime and read request.text() (App Router doesn't pre-parse it).

export const runtime = "nodejs";

// Statuses that mean "no paid access" — we drop the tier back to free so
// entitlements revoke immediately when a sub lapses or is cancelled.
const INACTIVE_STATUSES = new Set(["canceled", "unpaid", "incomplete_expired"]);

// Resolve which of OUR user ids a Stripe object belongs to: prefer the metadata
// we stamped at checkout, else map the Stripe customer id back via the table.
async function resolveUserId(
  admin: ReturnType<typeof createAdminClient>,
  metadataUserId: string | undefined,
  customerId: string | null
): Promise<string | null> {
  if (metadataUserId) return metadataUserId;
  if (!customerId) return null;
  const { data } = await admin
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return data?.user_id ?? null;
}

function customerIdOf(sub: Stripe.Subscription): string | null {
  return typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
}

// Derive the tier a subscription grants: the priced plan wins (so a mid-cycle
// plan change is honoured), falling back to the tier we stamped in metadata.
function tierOfSubscription(sub: Stripe.Subscription): AiTier {
  const priceId = sub.items.data[0]?.price?.id;
  const fromPrice = priceId ? tierForStripePrice(priceId) : null;
  if (fromPrice) return fromPrice;
  const metaTier = sub.metadata?.tier;
  if (isAiTier(metaTier)) return metaTier;
  return "free";
}

// Upsert the subscriptions row from a Stripe Subscription object.
async function syncSubscription(
  admin: ReturnType<typeof createAdminClient>,
  sub: Stripe.Subscription
): Promise<void> {
  const customerId = customerIdOf(sub);
  const userId = await resolveUserId(admin, sub.metadata?.user_id, customerId);
  if (!userId) {
    console.warn(`[stripe/webhook] no user for subscription ${sub.id} (customer ${customerId})`);
    return;
  }

  const inactive = INACTIVE_STATUSES.has(sub.status);
  const tier: AiTier = inactive ? "free" : tierOfSubscription(sub);
  const periodEnd = sub.current_period_end
    ? new Date(sub.current_period_end * 1000).toISOString()
    : null;

  const { error } = await admin.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      tier,
      status: sub.status,
      current_period_end: periodEnd,
      cancel_at_period_end: sub.cancel_at_period_end ?? false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) {
    console.error(`[stripe/webhook] upsert failed for user ${userId}:`, error.message);
    throw new Error(error.message); // 500 → Stripe retries
  }
}

export async function POST(request: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!stripe || !secret) {
    return NextResponse.json({ error: "Billing isn't configured." }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    // Async variant uses Web Crypto — safe on serverless without the sync crypto
    // shim. Throws on any signature/secret mismatch, which we reject.
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, secret);
  } catch (err) {
    console.warn("[stripe/webhook] signature verification failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  const admin = createAdminClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        // Subscriptions checkouts carry a subscription id — fetch the full object
        // so we sync from the same shape the subscription.* events use.
        if (session.mode === "subscription" && session.subscription) {
          const subId =
            typeof session.subscription === "string" ? session.subscription : session.subscription.id;
          const sub = await stripe.subscriptions.retrieve(subId);
          // Carry the checkout's user metadata onto the sub if Stripe didn't.
          if (!sub.metadata?.user_id && session.metadata?.user_id) {
            sub.metadata = { ...sub.metadata, user_id: session.metadata.user_id };
          }
          await syncSubscription(admin, sub);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await syncSubscription(admin, event.data.object as Stripe.Subscription);
        break;
      }
      default:
        // Unhandled event types are acknowledged so Stripe stops retrying them.
        break;
    }
  } catch (err) {
    // A processing failure returns 500 so Stripe retries with backoff.
    console.error("[stripe/webhook] handler error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Handler error." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
