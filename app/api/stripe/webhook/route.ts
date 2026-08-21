import { NextResponse } from "next/server";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/billing/stripe";
import {
  syncSubscription,
  resolveUserId,
  customerIdOf,
  tierOfSubscription,
  customEntitlementsOf,
} from "@/lib/billing/sync";
import { notifySubscriptionChange, emailForUser } from "@/lib/billing/notify";
import { alertOnStripeEvent } from "@/lib/notifications/billing-alerts";
import { dayLabelFromUnix } from "@/lib/billing/format";
import { loadCatalog, planName, resolverFor, slugForStripePrice } from "@/lib/billing/catalog";
import type { AiTier } from "@/lib/ai/tier";
import type { Entitlements } from "@/lib/billing/entitlements";
import {
  formatMoney,
  sendSubscriptionWelcome,
  sendPaymentReceipt,
  sendPaymentFailed,
  sendRenewalReminder,
  sendSubscriptionCancelled,
  sendRefundIssued,
  sendDisputeAlert,
  sendTrialEndingSoon,
} from "@/lib/email/billing";

// Stripe webhook (L6 / B1, hardened) — the SOLE writer of the subscriptions table
// AND the single place every billing side effect (state change + customer email)
// happens, so a refund issued from the admin UI, the Stripe API, or the Stripe
// dashboard all behave identically. Every request is signature-verified against
// STRIPE_WEBHOOK_SECRET before we trust a byte of it; an unverified/forged call is
// rejected 400.
//
// This is also where DEFERRED PLAN CHANGES actually land. A scheduled upgrade or
// downgrade doesn't touch the app when the user requests it — Stripe advances the
// subscription schedule's phase at the renewal date and sends
// customer.subscription.updated, and only THEN does `tier` move here and the
// "your new plan is live" email go out. See lib/billing/schedule.ts.
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

// Which plan a Stripe Price sells. A custom (build-your-own) subscription's
// ad-hoc price matches no catalog price, so it reads as the custom tier.
// Resolves ARCHIVED prices too, which is what keeps a customer grandfathered on
// an older price from being labelled with the wrong plan.
async function planFromPriceId(priceId: string | null | undefined): Promise<{ tier: AiTier; name: string }> {
  const catalog = await loadCatalog();
  // Catalog slugs are plain strings — an admin can create a plan whose slug this
  // build's AiTier union has never heard of. The union is widened separately;
  // until then the cast is what lets a new plan resolve at all rather than being
  // silently mislabelled as custom.
  const slug = (priceId ? slugForStripePrice(catalog, priceId) : null) as AiTier | null;
  const tier: AiTier = slug ?? "custom";
  return { tier, name: planName(catalog, tier) };
}

function subscriptionIdOf(invoice: Stripe.Invoice): string | null {
  const sub = invoice.subscription;
  if (!sub) return null;
  return typeof sub === "string" ? sub : sub.id;
}

// A custom subscriber's own limits, for emails that list what a plan includes.
// Only fetched when it matters (custom tier) — fixed tiers read ENTITLEMENTS.
async function customEntitlementsForInvoice(
  stripe: Stripe,
  invoice: Stripe.Invoice,
  tier: AiTier
): Promise<Entitlements | null> {
  if (tier !== "custom") return null;
  const subId = subscriptionIdOf(invoice);
  if (!subId) return null;
  try {
    return customEntitlementsOf(await stripe.subscriptions.retrieve(subId));
  } catch {
    return null;
  }
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

// Sync + diff-notify: writes the row, then lets lib/billing/notify decide which
// (if any) lifecycle email this transition earns.
async function syncAndNotify(
  admin: SupabaseClient,
  stripe: Stripe,
  sub: Stripe.Subscription
): Promise<void> {
  const result = await syncSubscription(admin, sub, stripe, resolverFor(await loadCatalog()));
  if (result) await notifySubscriptionChange(admin, sub, result);
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
  const { tier, name: tierName } = await planFromPriceId(line?.price?.id);
  const renewsOnLabel = dayLabelFromUnix(line?.period?.end ?? invoice.period_end);

  if (reason === "subscription_create") {
    await sendSubscriptionWelcome({
      to,
      tierName,
      tier,
      entitlements: await customEntitlementsForInvoice(stripe, invoice, tier),
      renewsOnLabel,
      amountLabel: formatMoney(invoice.amount_paid, invoice.currency),
      invoiceUrl: invoice.hosted_invoice_url,
    });
  } else {
    await sendPaymentReceipt({
      to,
      tierName,
      amountLabel: formatMoney(invoice.amount_paid, invoice.currency),
      invoiceUrl: invoice.hosted_invoice_url,
      invoiceNumber: invoice.number,
      paidOnLabel: dayLabelFromUnix(invoice.status_transitions?.paid_at ?? invoice.created),
      renewsOnLabel,
      // `subscription_update` is the mid-period difference Stripe invoices when
      // a customer upgrades — a receipt, but not a monthly one.
      kind: reason === "subscription_update" ? "proration" : "renewal",
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
  const { name: tierName } = await planFromPriceId(invoice.lines?.data?.[0]?.price?.id);
  await sendPaymentFailed({
    to,
    tierName,
    amountLabel: formatMoney(invoice.amount_due, invoice.currency),
    nextAttemptLabel: dayLabelFromUnix(invoice.next_payment_attempt),
    invoiceUrl: invoice.hosted_invoice_url,
  });
}

// invoice.upcoming — Stripe's advance notice (a few days before it charges).
// The upcoming invoice has no id and can't be re-fetched, so read it as sent.
async function handleInvoiceUpcoming(
  admin: SupabaseClient,
  invoice: Stripe.Invoice
): Promise<void> {
  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? null;
  const userId = await resolveUserId(admin, undefined, customerId);
  const to = invoice.customer_email ?? (await emailForUser(admin, userId));
  if (!to) return;

  const renewsOnLabel = dayLabelFromUnix(
    invoice.next_payment_attempt ?? invoice.period_end ?? invoice.lines?.data?.[0]?.period?.end
  );
  if (!renewsOnLabel) return;

  // Name the pending plan too, if one is scheduled — this is the last email
  // before a deferred change takes effect, so it doubles as the final heads-up.
  let pendingTierName: string | null = null;
  let currentTierName = (await planFromPriceId(invoice.lines?.data?.[0]?.price?.id)).name;
  if (userId) {
    try {
      const { data } = await admin
        .from("subscriptions")
        .select("tier, pending_tier")
        .eq("user_id", userId)
        .maybeSingle();
      const catalog = await loadCatalog();
      if (data?.tier) currentTierName = planName(catalog, data.tier as string);
      if (data?.pending_tier) pendingTierName = planName(catalog, data.pending_tier as string);
    } catch {
      // Pre-migration database — the reminder is still worth sending without it.
    }
  }

  await sendRenewalReminder({
    to,
    tierName: currentTierName,
    amountLabel: formatMoney(invoice.amount_due, invoice.currency),
    renewsOnLabel,
    pendingTierName,
  });
}

async function handleSubscriptionDeleted(
  admin: SupabaseClient,
  stripe: Stripe,
  sub: Stripe.Subscription
): Promise<void> {
  // Sync first — drops the row's tier to free so entitlements revoke — then notify.
  const catalog = await loadCatalog();
  const resolve = resolverFor(catalog);
  const tierName = planName(catalog, tierOfSubscription(sub, resolve));
  await syncSubscription(admin, sub, stripe, resolve);
  const userId = await resolveUserId(admin, sub.metadata?.user_id, customerIdOf(sub));
  const to = await emailForUser(admin, userId);
  if (!to) return;
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
    await sendRefundIssued({
      to,
      amountLabel: formatMoney(charge.amount_refunded, charge.currency),
      full: charge.refunded,
    });
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
    dueByLabel: dayLabelFromUnix(dispute.evidence_details?.due_by),
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
          await syncSubscription(admin, sub, stripe, resolverFor(await loadCatalog()));
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        // Also the moment a SCHEDULED plan change goes live: Stripe advances the
        // schedule phase at the renewal and the new price lands here.
        const sub = await canonicalSub(stripe, event.data.object as Stripe.Subscription);
        await syncAndNotify(admin, stripe, sub);
        break;
      }
      case "customer.subscription.trial_will_end": {
        // Stripe's three-day warning. The subscription itself doesn't change
        // here, so this only notifies — the trial→active transition arrives
        // later as customer.subscription.updated and syncs normally.
        const sub = await canonicalSub(stripe, event.data.object as Stripe.Subscription);
        const catalog = await loadCatalog();
        const to = await emailForUser(admin, await resolveUserId(admin, sub.metadata?.user_id, customerIdOf(sub)));
        if (to) {
          const price = sub.items?.data?.[0]?.price;
          await sendTrialEndingSoon({
            to,
            tierName: planName(catalog, tierOfSubscription(sub, resolverFor(catalog))),
            amountLabel: price?.unit_amount != null ? formatMoney(price.unit_amount, price.currency) : null,
            endsOnLabel: dayLabelFromUnix(sub.trial_end),
          });
        }
        break;
      }
      case "customer.subscription.deleted": {
        const sub = await canonicalSub(stripe, event.data.object as Stripe.Subscription);
        await handleSubscriptionDeleted(admin, stripe, sub);
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
      case "invoice.upcoming": {
        await handleInvoiceUpcoming(admin, event.data.object as Stripe.Invoice);
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

  // Tell the founder what just moved. AFTER the handler, so an alert is only
  // ever raised for an event we actually processed, and outside its try/catch,
  // so alerting can never turn a successful webhook into a 500 Stripe retries.
  await alertOnStripeEvent(admin, event);

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
