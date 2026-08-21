// Stripe events → admin alerts.
//
// Kept OUT of the webhook handler so the handler stays the single place billing
// STATE changes (and the customer's own emails) are decided, and this stays the
// single place the founder's copy is decided. The webhook calls this once, after
// its own switch has run, with whatever the event carried.
//
// Everything here is read-only interpretation of the event payload: no Stripe
// API calls, no writes, no throwing. A malformed or unexpected payload results
// in a vaguer alert, never an exception on a webhook path — a throw here would
// become a 500, and a 500 makes Stripe retry an event that already succeeded.

import "server-only";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyAdmins } from "@/lib/notifications/notify";
import { emailForUser } from "@/lib/billing/notify";

function money(amountMinor: number | null | undefined, currency: string | null | undefined): string {
  if (typeof amountMinor !== "number") return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: (currency ?? "usd").toUpperCase(),
    }).format(amountMinor / 100);
  } catch {
    return `${(amountMinor / 100).toFixed(2)} ${(currency ?? "").toUpperCase()}`.trim();
  }
}

function customerIdOf(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value) return String((value as { id: string }).id);
  return undefined;
}

// Best-effort account email for an object that carries our user_id in metadata.
async function emailFromMetadata(
  admin: SupabaseClient,
  metadata: Stripe.Metadata | null | undefined
): Promise<string | undefined> {
  const userId = metadata?.user_id;
  if (!userId) return undefined;
  return (await emailForUser(admin, userId)) ?? undefined;
}

/**
 * Raise the admin alert (if any) for one Stripe event. Silent for event types
 * that aren't worth an alert — most of them.
 */
export async function alertOnStripeEvent(admin: SupabaseClient, event: Stripe.Event): Promise<void> {
  try {
    switch (event.type) {
      case "customer.subscription.created": {
        const sub = event.data.object as Stripe.Subscription;
        const price = sub.items?.data?.[0]?.price;
        const trialing = sub.status === "trialing";
        await notifyAdmins(
          "billing.subscription_started",
          {
            title: trialing
              ? `Trial started — ${money(price?.unit_amount, price?.currency)}/${price?.recurring?.interval ?? "mo"}`
              : `New subscription — ${money(price?.unit_amount, price?.currency)}/${price?.recurring?.interval ?? "mo"}`,
            summary: trialing
              ? "A trial began. It converts (or doesn't) at the end of the trial period."
              : "A customer is now paying.",
            context: {
              Customer: await emailFromMetadata(admin, sub.metadata),
              Status: sub.status,
              Amount: money(price?.unit_amount, price?.currency),
              Interval: price?.recurring?.interval ?? undefined,
              "Stripe customer": customerIdOf(sub.customer),
            },
            link: "/admin/billing",
            dedupeKey: `subscription:${sub.id}`,
          },
          { admin }
        );
        return;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const price = sub.items?.data?.[0]?.price;
        await notifyAdmins(
          "billing.subscription_canceled",
          {
            title: `Subscription ended — ${money(price?.unit_amount, price?.currency)}/${price?.recurring?.interval ?? "mo"}`,
            summary:
              "The subscription is over: access drops to free at the end of the paid period. Worth one outreach email while the reason is still fresh.",
            context: {
              Customer: await emailFromMetadata(admin, sub.metadata),
              "Was paying": money(price?.unit_amount, price?.currency),
              "Cancel reason": sub.cancellation_details?.reason ?? undefined,
              "Their comment": sub.cancellation_details?.comment ?? undefined,
              "Stripe customer": customerIdOf(sub.customer),
            },
            link: "/admin/billing",
            dedupeKey: `subscription:${sub.id}`,
          },
          { admin }
        );
        return;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const attempt = invoice.attempt_count ?? 1;
        await notifyAdmins(
          "billing.payment_failed",
          {
            title: `Payment failed — ${money(invoice.amount_due, invoice.currency)}`,
            summary:
              "Stripe couldn't charge this customer. Dunning retries automatically; if every retry fails the subscription lapses.",
            context: {
              Customer: invoice.customer_email ?? (await emailFromMetadata(admin, invoice.metadata)),
              Amount: money(invoice.amount_due, invoice.currency),
              Attempt: String(attempt),
              "Stripe customer": customerIdOf(invoice.customer),
            },
            link: "/admin/billing",
            // Per INVOICE, not per customer: dunning retries the same invoice
            // several times over ~two weeks, and the event's repeat window
            // folds those attempts into this one alert.
            dedupeKey: `invoice:${invoice.id}`,
          },
          { admin }
        );
        return;
      }

      case "charge.dispute.created": {
        const dispute = event.data.object as Stripe.Dispute;
        const dueBy = dispute.evidence_details?.due_by
          ? new Date(dispute.evidence_details.due_by * 1000).toUTCString()
          : undefined;
        await notifyAdmins(
          "billing.dispute_opened",
          {
            title: `Chargeback opened — ${money(dispute.amount, dispute.currency)}`,
            summary:
              "A customer disputed a charge. Stripe holds the money and charges a dispute fee; you have to submit evidence before the deadline or it's lost by default.",
            context: {
              Amount: money(dispute.amount, dispute.currency),
              Reason: dispute.reason,
              Status: dispute.status,
              "Evidence due by": dueBy,
              "Stripe dispute": dispute.id,
            },
            link: "/admin/billing",
            dedupeKey: `dispute:${dispute.id}`,
          },
          { admin }
        );
        return;
      }

      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        await notifyAdmins(
          "billing.refund_issued",
          {
            title: `Refund issued — ${money(charge.amount_refunded, charge.currency)}`,
            context: {
              Customer: charge.billing_details?.email ?? charge.receipt_email ?? undefined,
              Refunded: money(charge.amount_refunded, charge.currency),
              "Original charge": money(charge.amount, charge.currency),
              Partial: charge.amount_refunded < charge.amount ? "yes" : "no",
              "Stripe charge": charge.id,
            },
            link: "/admin/billing",
            dedupeKey: `charge:${charge.id}`,
          },
          { admin }
        );
        return;
      }

      default:
        return;
    }
  } catch (err) {
    console.warn(
      `[alerts] stripe ${event.type} alert failed:`,
      err instanceof Error ? err.message : err
    );
  }
}
