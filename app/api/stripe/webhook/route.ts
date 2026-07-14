import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/billing/stripe";
import { syncSubscription } from "@/lib/billing/sync";

// Stripe webhook (L6 / B1) — the SOLE writer of the subscriptions table. Every
// request is signature-verified against STRIPE_WEBHOOK_SECRET before we trust a
// byte of it; an unverified/forged call is rejected 400. On the subscription
// lifecycle events we recompute the user's tier from the priced plan and upsert
// it, so entitlements + AI routing follow Stripe as the source of truth.
//
// Needs the raw request body for signature verification, so this must stay on
// the Node runtime and read request.text() (App Router doesn't pre-parse it).

export const runtime = "nodejs";

// The subscriptions upsert logic lives in lib/billing/sync.ts so the admin
// "re-sync from Stripe" action writes the row identically. This route owns only
// signature verification + event routing.

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
