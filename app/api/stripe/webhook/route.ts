import { NextResponse } from "next/server";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/billing/stripe";
import { syncSubscription, resolveUserId, customerIdOf, tierOfSubscription } from "@/lib/billing/sync";
import { planFor, tierForStripePrice } from "@/lib/billing/plans";
import {
  formatMoney,
  sendSubscriptionWelcome,
  sendPaymentReceipt,
  sendPaymentFailed,
  sendSubscriptionCancelled,
  sendRefundIssued,
  sendDisputeAlert,
} from "@/lib/email/billing";

// Stripe webhook (L6 / B1, hardened) — the SOLE writer of the subscriptions table
// AND the single place every billing side effect (state change + customer email)
// happens, so a refund issued from the admin UI, the Stripe API, or the Stripe
// dashboard all behave identically. Every request is signature-verified against
// STRIPE_WEBHOOK_SECRET before we trust a byte of it; an unverified/forged call is
// rejected 400.
//
// Idempotency: Stripe delivers events AT LEAST once (retries on our 5xx, plus the
// odd duplicate). We record each fully-processed event id in `billing_events` and
// skip any id we've already finished — the record is written AFTER the handler
// succeeds, so an event that 500s is left un-recorded and Stripe's retry
// reprocesses it. Handlers are individually idempotent (upserts) so a rare
// duplicate that races the guard is harmless.
//
// Needs the raw request body for signature verification, so this stays on the Node
// runtime and reads request.text() (App Router doesn't pre-parse it).

export const runtime = "nodejs";

// ── small helpers ────────────────────────────────────────────────────────────

// Look up a user's email from GoTrue (service-role). Best-effort — null on any
// failure so a missing email just means "no notification", never a 500.
async function emailForUser(admin: SupabaseClient, userId: string | null): Promise<string | null> {
  if (!userId) return null;
  try {
    const { data } = await admin.auth.admin.getUserById(userId);
    return data.user?.email ?? null;
  } catch {
    return null;
  }
}

// Display name of the plan a Stripe Price sells; "Custom" for the ad-hoc
// (build-your-own) price, which matches no fixed STRIPE_PRICE_* id.
function tierNameFromPriceId(priceId: string | null | undefined): string {
  const tier = priceId ? tierForStripePrice(priceId) : null;
  return tier ? planFor(tier).name : "Custom";
}

function fmtUnix(unix: number | null | undefined): string | null {
  if (!unix) return null;
  return new Date(unix * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ── event handlers ───────────────────────────────────────────────────────────

// Re-fetch a subscription through OUR pinned client so its shape always matches
// the app's API version, regardless of what version the webhook endpoint renders
// events at (a newer account/endpoint default moves fields like current_period_end
// onto items and drops invoice.subscription). Falls back to the event payload if
// the re-fetch fails. This is the single defence against Stripe API-version skew.
async function canonicalSub(stripe: Stripe, sub: Stripe.Subscription): Promise<Stripe.Subscription> {
  try {
    const fresh = await stripe.subscriptions.retrieve(sub.id);
    // Preserve any metadata the live object may omit (e.g. user_id stamped only
    // on the checkout session), so resolveUserId still maps correctly.
    if (!fresh.metadata?.user_id && sub.metadata?.user_id) {
      fresh.metadata = { ...fresh.metadata, ...sub.metadata };
    }
    return fresh;
  } catch {
    return sub;
  }
}

async function handleInvoicePaid(
  admin: SupabaseClient,
  stripe: Stripe,
  invoiceEvent: Stripe.Invoice
): Promise<void> {
  // Re-fetch at our pinned version so line.price / invoice.subscription are present.
  const invoice = invoiceEvent.id
    ? await stripe.invoices.retrieve(invoiceEvent.id).catch(() => invoiceEvent)
    : invoiceEvent;
  // Only subscription invoices are interesting here.
  const reason = invoice.billing_reason;
  if (!invoice.subscription && !reason?.startsWith("subscription")) return;

  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? null;
  const userId = await resolveUserId(admin, undefined, customerId);
  const to = invoice.customer_email ?? (await emailForUser(admin, userId));
  if (!to) return;

  const line = invoice.lines?.data?.[0];
  const tierName = tierNameFromPriceId(line?.price?.id);
  const renewsOnLabel = fmtUnix(line?.period?.end ?? invoice.period_end);

  if (reason === "subscription_create") {
    await sendSubscriptionWelcome({ to, tierName, renewsOnLabel });
  } else {
    await sendPaymentReceipt({
      to,
      tierName,
      amountLabel: formatMoney(invoice.amount_paid, invoice.currency),
      invoiceUrl: invoice.hosted_invoice_url,
      renewsOnLabel,
    });
  }
}

async function handleInvoiceFailed(
  admin: SupabaseClient,
  stripe: Stripe,
  invoiceEvent: Stripe.Invoice
): Promise<void> {
  const invoice = invoiceEvent.id
    ? await stripe.invoices.retrieve(invoiceEvent.id).catch(() => invoiceEvent)
    : invoiceEvent;
  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? null;
  const userId = await resolveUserId(admin, undefined, customerId);
  const to = invoice.customer_email ?? (await emailForUser(admin, userId));
  if (!to) return;
  const tierName = tierNameFromPriceId(invoice.lines?.data?.[0]?.price?.id);
  await sendPaymentFailed({ to, tierName });
}

async function handleSubscriptionDeleted(
  admin: SupabaseClient,
  sub: Stripe.Subscription
): Promise<void> {
  // Sync first — drops the row's tier to free so entitlements revoke — then notify.
  await syncSubscription(admin, sub);
  const userId = await resolveUserId(admin, sub.metadata?.user_id, customerIdOf(sub));
  const to = await emailForUser(admin, userId);
  if (!to) return;
  const tierName = planFor(tierOfSubscription(sub)).name;
  await sendSubscriptionCancelled({ to, tierName, accessUntilLabel: null });
}

async function handleChargeRefunded(
  admin: SupabaseClient,
  stripe: Stripe,
  charge: Stripe.Charge
): Promise<void> {
  const customerId = typeof charge.customer === "string" ? charge.customer : charge.customer?.id ?? null;
  const userId = await resolveUserId(admin, undefined, customerId);
  const to = charge.billing_details?.email ?? (await emailForUser(admin, userId));
  if (to) {
    await sendRefundIssued({ to, amountLabel: formatMoney(charge.amount_refunded, charge.currency) });
  }

  // Policy: a FULL refund cancels the subscription immediately. charge.refunded is
  // true only when the whole charge is refunded. Cancelling emits
  // customer.subscription.deleted, which drops the tier to free + sends the
  // cancellation email — so we don't touch the table or tier here.
  if (!charge.refunded || !userId) return;
  const { data: row } = await admin
    .from("subscriptions")
    .select("stripe_subscription_id, status")
    .eq("user_id", userId)
    .maybeSingle();
  const subId = row?.stripe_subscription_id as string | null | undefined;
  if (!subId) return;
  if (row?.status === "canceled") return; // already gone — nothing to cancel
  try {
    await stripe.subscriptions.cancel(subId);
  } catch (err) {
    // Already-canceled subs throw; that's fine (idempotent outcome).
    console.warn("[stripe/webhook] cancel-after-refund skipped:", err instanceof Error ? err.message : err);
  }
}

async function handleDispute(
  admin: SupabaseClient,
  stripe: Stripe,
  dispute: Stripe.Dispute
): Promise<void> {
  const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id ?? "unknown";
  // Best-effort: enrich the alert with the customer's email.
  let customerEmail: string | null = null;
  try {
    const charge = await stripe.charges.retrieve(chargeId);
    customerEmail = charge.billing_details?.email ?? null;
  } catch {
    // non-fatal
  }
  await sendDisputeAlert({
    chargeId,
    amountLabel: formatMoney(dispute.amount, dispute.currency),
    reason: dispute.reason,
    customerEmail,
  });
}

// ── route ────────────────────────────────────────────────────────────────────

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

  // Idempotency guard — skip an event we've already fully processed. Fail-open:
  // if the table isn't migrated yet the lookup errors and we just process anyway.
  try {
    const { data: seen } = await admin
      .from("billing_events")
      .select("processed_at")
      .eq("id", event.id)
      .maybeSingle();
    if (seen?.processed_at) {
      return NextResponse.json({ received: true, deduped: true });
    }
  } catch {
    // billing_events not available — proceed without dedupe.
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        // Subscription checkouts carry a subscription id — fetch the full object
        // so we sync from the same shape the subscription.* events use.
        if (session.mode === "subscription" && session.subscription) {
          const subId =
            typeof session.subscription === "string" ? session.subscription : session.subscription.id;
          const sub = await stripe.subscriptions.retrieve(subId);
          if (!sub.metadata?.user_id && session.metadata?.user_id) {
            sub.metadata = { ...sub.metadata, user_id: session.metadata.user_id };
          }
          await syncSubscription(admin, sub);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = await canonicalSub(stripe, event.data.object as Stripe.Subscription);
        await syncSubscription(admin, sub);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = await canonicalSub(stripe, event.data.object as Stripe.Subscription);
        await handleSubscriptionDeleted(admin, sub);
        break;
      }
      case "invoice.payment_succeeded": {
        await handleInvoicePaid(admin, stripe, event.data.object as Stripe.Invoice);
        break;
      }
      case "invoice.payment_failed": {
        await handleInvoiceFailed(admin, stripe, event.data.object as Stripe.Invoice);
        break;
      }
      case "charge.refunded": {
        await handleChargeRefunded(admin, stripe, event.data.object as Stripe.Charge);
        break;
      }
      case "charge.dispute.created": {
        await handleDispute(admin, stripe, event.data.object as Stripe.Dispute);
        break;
      }
      default:
        // Unhandled event types are acknowledged so Stripe stops retrying them.
        break;
    }
  } catch (err) {
    // A processing failure returns 500 so Stripe retries with backoff. We do NOT
    // record the event as processed, so the retry re-runs it.
    console.error("[stripe/webhook] handler error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Handler error." }, { status: 500 });
  }

  // Record success for idempotency (best-effort; never fail the ack over this).
  try {
    await admin
      .from("billing_events")
      .upsert(
        { id: event.id, type: event.type, processed_at: new Date().toISOString() },
        { onConflict: "id" }
      );
  } catch {
    // billing_events not available — dedupe simply won't apply.
  }

  return NextResponse.json({ received: true });
}
