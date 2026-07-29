// Subscription-state change notifications.
//
// Every "your subscription changed" email is decided HERE, by diffing the row as
// it was against the row we just wrote (see SyncResult.previous in
// lib/billing/sync.ts) — never by trusting the caller's intent. That's what makes
// a change cancel, resume or plan switch notify identically whether it came from
// our billing page, the Stripe Billing Portal, the Stripe dashboard, or Stripe's
// own clock advancing a scheduled phase.
//
// Called by both the webhook and the in-app billing routes right after they sync.
// Whichever observes the transition first sends the mail; the other sees no diff
// and stays quiet, so the user gets exactly one email per real change.
//
// Fail-open: notification failures are logged, never thrown — a billing state
// change must not be rolled back because an email didn't send.

import "server-only";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { planFor } from "@/lib/billing/plans";
import { customEntitlementsOf } from "@/lib/billing/sync";
import type { SyncResult } from "@/lib/billing/sync";
import { dayLabel } from "@/lib/billing/format";
import { ACTIVE_STATUSES } from "@/lib/billing/subscription";
import {
  formatMoney,
  sendCancellationScheduled,
  sendPlanChangeApplied,
  sendSubscriptionResumed,
} from "@/lib/email/billing";

// Look up a user's email from GoTrue (service-role). Best-effort — null on any
// failure so a missing email just means "no notification", never a throw.
export async function emailForUser(
  admin: SupabaseClient,
  userId: string | null
): Promise<string | null> {
  if (!userId) return null;
  try {
    const { data } = await admin.auth.admin.getUserById(userId);
    return data.user?.email ?? null;
  } catch {
    return null;
  }
}

// The recurring amount the subscription bills, straight off its line item — the
// only source that's right for a custom plan's ad-hoc price too.
export function subscriptionAmountLabel(sub: Stripe.Subscription): string | null {
  const price = sub.items?.data?.[0]?.price;
  if (!price || typeof price.unit_amount !== "number") return null;
  return formatMoney(price.unit_amount, price.currency);
}

export type NotifyOptions = {
  // Set when the caller has already told the user they're staying (scheduling a
  // plan change implicitly un-cancels), so we don't also send "resumed".
  suppressResumed?: boolean;
};

export async function notifySubscriptionChange(
  admin: SupabaseClient,
  sub: Stripe.Subscription,
  result: SyncResult,
  options: NotifyOptions = {}
): Promise<void> {
  const previous = result.previous;
  // No history to diff against (first ever sync) — the welcome email owns that
  // moment, driven by the first paid invoice.
  if (!previous) return;

  const isActive = ACTIVE_STATUSES.has(result.status);
  const wasActive = ACTIVE_STATUSES.has(previous.status);

  try {
    // 1. A scheduled plan change went live: Stripe advanced the schedule phase
    //    at the renewal, so the tier on a still-active subscription moved.
    if (
      isActive &&
      wasActive &&
      previous.tier !== "free" &&
      result.tier !== "free" &&
      previous.tier !== result.tier
    ) {
      const to = await emailForUser(admin, result.userId);
      if (to) {
        await sendPlanChangeApplied({
          to,
          previousTierName: planFor(previous.tier).name,
          tier: result.tier,
          tierName: planFor(result.tier).name,
          entitlements: result.tier === "custom" ? customEntitlementsOf(sub) : null,
          amountLabel: subscriptionAmountLabel(sub),
          renewsOnLabel: dayLabel(result.currentPeriodEnd),
        });
      }
    }

    // 2. Cancellation booked for the end of the paid period.
    if (isActive && !previous.cancelAtPeriodEnd && result.cancelAtPeriodEnd) {
      const to = await emailForUser(admin, result.userId);
      if (to) {
        await sendCancellationScheduled({
          to,
          tierName: planFor(result.tier).name,
          accessUntilLabel: dayLabel(result.currentPeriodEnd),
        });
      }
    }

    // 3. Cancellation called off.
    if (isActive && previous.cancelAtPeriodEnd && !result.cancelAtPeriodEnd && !options.suppressResumed) {
      const to = await emailForUser(admin, result.userId);
      if (to) {
        await sendSubscriptionResumed({
          to,
          tierName: planFor(result.tier).name,
          renewsOnLabel: dayLabel(result.currentPeriodEnd),
          amountLabel: subscriptionAmountLabel(sub),
        });
      }
    }
  } catch (err) {
    console.warn(
      "[billing/notify] change notification failed:",
      err instanceof Error ? err.message : err
    );
  }
}
