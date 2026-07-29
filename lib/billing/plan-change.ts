// In-app plan-change service — the one place the billing UI's write actions are
// implemented, so /api/billing/checkout and /api/billing/plan stay thin and the
// end-of-period policy can't be half-applied by one of them.
//
// Three actions, all of which respect what the customer already paid for:
//   schedulePlanChangeForUser  — new plan starts at the next renewal, not now
//   cancelScheduledChangeForUser — drop a scheduled change, keep today's plan
//   setSubscriptionCancellation  — end (or un-end) the subscription at period end
//
// Each one drives Stripe first, re-syncs our row from the fresh Stripe object
// (so the billing page is correct on the very next render instead of waiting for
// the webhook), and then notifies. The webhook re-does all of it idempotently.

import "server-only";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiTier } from "@/lib/ai/tier";
import { planFor, stripePriceIdForTier } from "@/lib/billing/plans";
import { syncSubscription } from "@/lib/billing/sync";
import { notifySubscriptionChange, emailForUser } from "@/lib/billing/notify";
import { dayLabel, planChangeDirection, type PlanChangeDirection } from "@/lib/billing/format";
import {
  customPlanPriceId,
  releasePlanChange,
  schedulePlanChange,
  scheduleIdOf,
  type PlanChangeTarget,
} from "@/lib/billing/schedule";
import {
  clampCustomConfig,
  computeCustomEntitlements,
  computeCustomPriceAed,
  type CustomPlanConfig,
} from "@/lib/billing/custom-pricing";
import { sendPlanChangeCancelled, sendPlanChangeScheduled } from "@/lib/email/billing";

export type ActionFailure = { ok: false; status: number; error: string };

export type ScheduledChange = {
  ok: true;
  tier: AiTier;
  tierName: string;
  /** ISO timestamp the new plan takes over (= current period end). */
  effectiveAt: string;
  effectiveOnLabel: string | null;
  priceAed: number | null;
  direction: PlanChangeDirection;
};

// Resolve what the next phase should bill: a fixed tier's configured Stripe
// Price, or an ad-hoc monthly Price built from a validated custom config.
async function resolveTarget(
  stripe: Stripe,
  userId: string,
  tier: AiTier,
  config?: CustomPlanConfig
): Promise<PlanChangeTarget | ActionFailure> {
  if (tier === "custom") {
    if (!config) return { ok: false, status: 400, error: "Pick your custom plan options first." };
    const clamped = clampCustomConfig(config);
    const priceAed = computeCustomPriceAed(clamped);
    const entitlements = computeCustomEntitlements(clamped);
    const priceId = await customPlanPriceId(stripe, priceAed);
    return { userId, tier, priceId, priceAed, entitlements };
  }

  const priceId = stripePriceIdForTier(tier);
  if (!priceId) {
    return { ok: false, status: 503, error: "That plan isn't available for purchase yet." };
  }
  return { userId, tier, priceId, priceAed: planFor(tier).priceAed || null, entitlements: null };
}

function isFailure(value: PlanChangeTarget | ActionFailure): value is ActionFailure {
  return "ok" in value && value.ok === false;
}

// Book `tier` to start at the end of the period the user has already paid for.
export async function schedulePlanChangeForUser(params: {
  admin: SupabaseClient;
  stripe: Stripe;
  userId: string;
  subscriptionId: string;
  currentTier: AiTier;
  tier: AiTier;
  config?: CustomPlanConfig;
}): Promise<ScheduledChange | ActionFailure> {
  const { admin, stripe, userId, subscriptionId, currentTier, tier, config } = params;

  const target = await resolveTarget(stripe, userId, tier, config);
  if (isFailure(target)) return target;

  let pending;
  try {
    pending = await schedulePlanChange(stripe, subscriptionId, target);
  } catch (err) {
    console.error(
      "[billing/plan-change] schedule failed:",
      err instanceof Error ? err.message : err
    );
    return { ok: false, status: 502, error: "Could not schedule your plan change. Please try again." };
  }

  // Refresh our row from the subscription as Stripe now sees it (schedule
  // attached, any pending cancellation cleared) so the billing page renders the
  // scheduled change immediately.
  const fresh = await stripe.subscriptions.retrieve(subscriptionId).catch(() => null);
  if (fresh) {
    const result = await syncSubscription(admin, fresh, stripe).catch((err) => {
      console.warn("[billing/plan-change] post-schedule sync failed:", err instanceof Error ? err.message : err);
      return null;
    });
    // Scheduling a plan implies staying subscribed; the confirmation email below
    // already says so, so don't also send a "your cancellation was called off".
    if (result) await notifySubscriptionChange(admin, fresh, result, { suppressResumed: true });
  }

  const direction = planChangeDirection(currentTier, tier);
  const effectiveOnLabel = dayLabel(pending.effectiveAt);

  const to = await emailForUser(admin, userId);
  if (to && effectiveOnLabel) {
    await sendPlanChangeScheduled({
      to,
      currentTierName: planFor(currentTier).name,
      nextTier: tier,
      nextTierName: planFor(tier).name,
      effectiveOnLabel,
      nextPriceLabel: pending.priceAed ? `AED ${pending.priceAed}` : null,
      nextEntitlements: pending.entitlements,
      direction,
    });
  }

  return {
    ok: true,
    tier,
    tierName: planFor(tier).name,
    effectiveAt: pending.effectiveAt,
    effectiveOnLabel,
    priceAed: pending.priceAed,
    direction,
  };
}

// Drop a scheduled change — the user keeps the plan they're on and it keeps
// renewing. Safe to call when nothing is scheduled (reports it and stops).
export async function cancelScheduledChangeForUser(params: {
  admin: SupabaseClient;
  stripe: Stripe;
  userId: string;
  subscriptionId: string;
}): Promise<{ ok: true; tierName: string; cancelledTierName: string | null } | ActionFailure> {
  const { admin, stripe, userId, subscriptionId } = params;

  let sub: Stripe.Subscription;
  try {
    sub = await stripe.subscriptions.retrieve(subscriptionId);
  } catch (err) {
    console.error("[billing/plan-change] retrieve failed:", err instanceof Error ? err.message : err);
    return { ok: false, status: 502, error: "Could not reach Stripe. Please try again." };
  }

  const scheduleId = scheduleIdOf(sub);
  if (!scheduleId) {
    return { ok: false, status: 409, error: "There's no scheduled plan change to cancel." };
  }

  // Read what was scheduled BEFORE releasing, so the email can name it.
  let cancelledTierName: string | null = null;
  try {
    const { data } = await admin
      .from("subscriptions")
      .select("pending_tier")
      .eq("user_id", userId)
      .maybeSingle();
    if (data?.pending_tier) cancelledTierName = planFor(data.pending_tier as AiTier).name;
  } catch {
    // Cosmetic only — the release below is what matters.
  }

  try {
    await releasePlanChange(stripe, scheduleId);
  } catch (err) {
    console.error("[billing/plan-change] release failed:", err instanceof Error ? err.message : err);
    return { ok: false, status: 502, error: "Could not cancel the scheduled change. Please try again." };
  }

  const fresh = await stripe.subscriptions.retrieve(subscriptionId).catch(() => null);
  let tierName = planFor("free").name;
  if (fresh) {
    const result = await syncSubscription(admin, fresh, stripe).catch(() => null);
    if (result) tierName = planFor(result.tier).name;
  }

  const to = await emailForUser(admin, userId);
  if (to) {
    await sendPlanChangeCancelled({
      to,
      tierName,
      cancelledTierName: cancelledTierName ?? "the scheduled plan",
      renewsOnLabel: dayLabel(
        fresh?.current_period_end ? new Date(fresh.current_period_end * 1000) : null
      ),
    });
  }

  return { ok: true, tierName, cancelledTierName };
}

// End the subscription when the paid period runs out (cancel = true), or take
// that back (cancel = false). The customer-facing email is sent by the shared
// diff-notifier, so a cancellation started here and one started in the Stripe
// portal produce exactly the same message.
export async function setSubscriptionCancellation(params: {
  admin: SupabaseClient;
  stripe: Stripe;
  userId: string;
  subscriptionId: string;
  cancel: boolean;
}): Promise<{ ok: true; cancelAtPeriodEnd: boolean; accessUntil: string | null } | ActionFailure> {
  const { admin, stripe, subscriptionId, cancel } = params;

  let updated: Stripe.Subscription;
  try {
    // A pending plan change is meaningless once the subscription is ending, and
    // it would otherwise keep the subscription alive past the cancellation date.
    if (cancel) {
      const current = await stripe.subscriptions.retrieve(subscriptionId);
      const scheduleId = scheduleIdOf(current);
      if (scheduleId) await releasePlanChange(stripe, scheduleId);
    }
    updated = await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: cancel });
  } catch (err) {
    console.error("[billing/plan-change] cancel toggle failed:", err instanceof Error ? err.message : err);
    return {
      ok: false,
      status: 502,
      error: cancel
        ? "Could not schedule your cancellation. Please try again."
        : "Could not resume your subscription. Please try again.",
    };
  }

  const result = await syncSubscription(admin, updated, stripe).catch((err) => {
    console.warn("[billing/plan-change] post-cancel sync failed:", err instanceof Error ? err.message : err);
    return null;
  });
  if (result) await notifySubscriptionChange(admin, updated, result);

  return {
    ok: true,
    cancelAtPeriodEnd: updated.cancel_at_period_end ?? cancel,
    accessUntil: result?.currentPeriodEnd ?? null,
  };
}

// Guard shared by the routes: the user must have a real, access-granting Stripe
// subscription before any of the above make sense.
export function requireActiveSubscription(sub: {
  active: boolean;
  stripeSubscriptionId: string | null;
} | null): { ok: true; subscriptionId: string } | ActionFailure {
  if (!sub?.active || !sub.stripeSubscriptionId) {
    return { ok: false, status: 400, error: "You don't have an active subscription to change." };
  }
  return { ok: true, subscriptionId: sub.stripeSubscriptionId };
}
