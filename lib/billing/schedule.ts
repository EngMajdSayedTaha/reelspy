// Deferred (end-of-period) plan changes.
//
// POLICY: a plan change NEVER takes effect mid-cycle. The user already paid for
// the period they're in, so they keep that plan — with its limits and its model
// — until the day their current period ends. The plan they picked starts on the
// next renewal date and is what they're charged for from then on. That holds for
// upgrades, downgrades and custom-plan reconfigurations alike, so there is one
// rule to explain in the UI and one rule in the code: **changes start next
// period, nothing is prorated, no surprise mid-cycle charge or credit.**
//
// Mechanism: a Stripe Subscription Schedule. Phase 0 is the period the customer
// is living in right now (untouched, same price, same dates); phase 1 starts the
// moment phase 0 ends and carries the new price. Stripe advances the phase on
// its own clock and emits customer.subscription.updated, which is when — and the
// only time — our `tier` column moves. `end_behavior: release` means once the
// new phase has run its first interval Stripe hands the subscription back and it
// simply continues on the new price forever.
//
// The schedule is the source of truth for "what's pending"; subscriptions'
// pending_* columns are a cache the billing page reads (see lib/billing/sync.ts).

import "server-only";
import type Stripe from "stripe";
import { isAiTier, type AiTier } from "@/lib/ai/tier";
import { coerceEntitlements, type Entitlements } from "@/lib/billing/entitlements";
import { planFor, tierForStripePrice, type PriceTierResolver } from "@/lib/billing/plans";

// A plan change that is scheduled but hasn't started yet.
export type PendingPlanChange = {
  tier: AiTier;
  /** ISO timestamp when the new plan takes over = current period end. */
  effectiveAt: string;
  /** Indicative monthly AED price of the pending plan (display only). */
  priceAed: number | null;
  /** Custom-plan limits the pending phase will grant; null for fixed tiers. */
  entitlements: Entitlements | null;
  scheduleId: string;
};

// What the caller wants the subscription to become next period.
export type PlanChangeTarget = {
  userId: string;
  tier: AiTier;
  /** Stripe Price the next phase bills. */
  priceId: string;
  priceAed: number | null;
  /** Custom-plan limits, carried on the phase metadata; null for fixed tiers. */
  entitlements: Entitlements | null;
};

// Schedule statuses we can still append a phase to. `completed`/`canceled`/
// `released` schedules are finished objects — Stripe also unsets
// subscription.schedule for them, so we'd create a fresh one instead.
const LIVE_SCHEDULE_STATUSES = new Set(["not_started", "active"]);

function priceIdOf(price: Stripe.SubscriptionSchedule.Phase.Item["price"]): string | null {
  if (!price) return null;
  return typeof price === "string" ? price : price.id;
}

// ── pure helpers (unit-tested without a Stripe client) ───────────────────────

export function scheduleIdOf(sub: Stripe.Subscription): string | null {
  if (!sub.schedule) return null;
  return typeof sub.schedule === "string" ? sub.schedule : sub.schedule.id;
}

// The phase the subscription is living in right now: the one that has started
// and hasn't ended. Falls back to the first phase so a clock skew of a few
// seconds around a boundary can't leave us with nothing to anchor on.
export function currentPhaseOf(
  schedule: Stripe.SubscriptionSchedule,
  nowSec: number
): Stripe.SubscriptionSchedule.Phase | null {
  const phases = schedule.phases ?? [];
  return (
    phases.find((p) => p.start_date <= nowSec && (!p.end_date || p.end_date > nowSec)) ??
    phases[0] ??
    null
  );
}

// Read the scheduled-but-not-started change out of a schedule object. Returns
// null when there is nothing pending (no future phase, or a finished schedule),
// which is what clears the cached pending_* columns.
export function pendingFromSchedule(
  schedule: Stripe.SubscriptionSchedule,
  nowSec: number = Math.floor(Date.now() / 1000),
  resolve: PriceTierResolver = tierForStripePrice
): PendingPlanChange | null {
  if (!LIVE_SCHEDULE_STATUSES.has(schedule.status)) return null;
  const next = (schedule.phases ?? []).find((p) => p.start_date > nowSec);
  if (!next) return null;

  const priceId = priceIdOf(next.items?.[0]?.price);
  // The tier a phase grants is resolved exactly like a live subscription's:
  // the Stripe Price wins, and an ad-hoc custom price (which matches no
  // configured price id) falls through to the tier stamped on the phase metadata.
  const fromPrice = priceId ? resolve(priceId) : null;
  const metaTier = next.metadata?.tier;
  const tier: AiTier | null = fromPrice ?? (isAiTier(metaTier) ? metaTier : null);
  if (!tier) return null;

  const rawPrice = Number(next.metadata?.price_aed);
  const priceAed = Number.isFinite(rawPrice) && rawPrice > 0 ? rawPrice : planFor(tier).priceAed || null;

  let entitlements: Entitlements | null = null;
  const rawEnt = next.metadata?.custom_entitlements;
  if (rawEnt) {
    try {
      entitlements = coerceEntitlements(JSON.parse(rawEnt));
    } catch {
      entitlements = null;
    }
  }

  return {
    tier,
    effectiveAt: new Date(next.start_date * 1000).toISOString(),
    priceAed,
    entitlements,
    scheduleId: schedule.id,
  };
}

// Rebuild a schedule's phases as [current period unchanged, new plan next].
// Exported for tests: this is the shape that decides whether the customer keeps
// what they paid for, so it's worth pinning down independently of Stripe.
export function buildPhases(
  currentPhase: Stripe.SubscriptionSchedule.Phase,
  target: PlanChangeTarget
): Stripe.SubscriptionScheduleUpdateParams.Phase[] {
  const keepItems = (currentPhase.items ?? [])
    .map((item) => {
      const price = priceIdOf(item.price);
      return price ? { price, quantity: item.quantity ?? 1 } : null;
    })
    .filter((i): i is { price: string; quantity: number } => i !== null);

  const nextMetadata: Record<string, string> = {
    user_id: target.userId,
    tier: target.tier,
  };
  if (target.priceAed != null) nextMetadata.price_aed = String(target.priceAed);
  if (target.entitlements) nextMetadata.custom_entitlements = JSON.stringify(target.entitlements);

  return [
    {
      // Same items, same window: the period the customer paid for is reproduced
      // verbatim so scheduling a change can never re-price the current cycle.
      items: keepItems,
      start_date: currentPhase.start_date,
      end_date: currentPhase.end_date ?? undefined,
      proration_behavior: "none",
      ...(currentPhase.metadata ? { metadata: currentPhase.metadata } : {}),
    },
    {
      items: [{ price: target.priceId, quantity: 1 }],
      // No end_date/iterations: Stripe runs one interval, then `release` hands
      // the subscription back and it continues on this price indefinitely.
      proration_behavior: "none",
      // Phase metadata is copied onto the SUBSCRIPTION when the phase starts,
      // which is how tierOfSubscription/customEntitlementsOf pick up a custom
      // plan's config at the moment it goes live.
      metadata: nextMetadata,
    },
  ];
}

// ── Stripe-touching operations ───────────────────────────────────────────────

// Reuse (or mint) a recurring AED Price for an ad-hoc custom-plan amount.
// Schedule phases need a real Price object — unlike Checkout, they can't take
// inline price_data — so custom plans get one price per distinct amount, keyed
// by lookup_key so repeat configs at the same price don't pile up.
export async function customPlanPriceId(stripe: Stripe, priceAed: number): Promise<string> {
  const lookupKey = `reelspy_custom_aed_${priceAed}`;
  try {
    const existing = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
    const found = existing.data[0];
    if (found) return found.id;
  } catch {
    // Fall through and create — a failed lookup must not block a plan change.
  }
  const productId = process.env.STRIPE_PRODUCT_CUSTOM?.trim();
  const price = await stripe.prices.create({
    currency: "aed",
    unit_amount: priceAed * 100,
    recurring: { interval: "month" },
    lookup_key: lookupKey,
    ...(productId ? { product: productId } : { product_data: { name: "ReelSpy Custom Plan" } }),
  });
  return price.id;
}

// Read the pending change straight from Stripe for a live subscription. Throws
// if Stripe is unreachable (callers treat that as "don't touch the cache"),
// returns null when there is provably nothing scheduled.
export async function readPendingChange(
  stripe: Stripe,
  sub: Stripe.Subscription,
  resolve: PriceTierResolver = tierForStripePrice
): Promise<PendingPlanChange | null> {
  const scheduleId = scheduleIdOf(sub);
  if (!scheduleId) return null;
  const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId);
  return pendingFromSchedule(schedule, Math.floor(Date.now() / 1000), resolve);
}

// Schedule `target` to take over when the current period ends. Idempotent in
// effect: calling it again just replaces the future phase, so a user can change
// their mind as many times as they like before the renewal date.
export async function schedulePlanChange(
  stripe: Stripe,
  subscriptionId: string,
  target: PlanChangeTarget
): Promise<PendingPlanChange> {
  let sub = await stripe.subscriptions.retrieve(subscriptionId);

  // Choosing a new plan means you're staying — clear a pending cancellation
  // first, otherwise the subscription would end before the new phase starts.
  if (sub.cancel_at_period_end) {
    sub = await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: false });
  }

  const existingId = scheduleIdOf(sub);
  let schedule = existingId ? await stripe.subscriptionSchedules.retrieve(existingId) : null;
  if (schedule && !LIVE_SCHEDULE_STATUSES.has(schedule.status)) schedule = null;
  if (!schedule) {
    schedule = await stripe.subscriptionSchedules.create({ from_subscription: subscriptionId });
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const currentPhase = currentPhaseOf(schedule, nowSec);
  if (!currentPhase || !currentPhase.end_date) {
    throw new Error(`subscription ${subscriptionId} has no billing period to schedule against`);
  }

  const updated = await stripe.subscriptionSchedules.update(schedule.id, {
    end_behavior: "release",
    phases: buildPhases(currentPhase, target),
  });

  const pending = pendingFromSchedule(updated, nowSec);
  if (!pending) {
    throw new Error(`schedule ${schedule.id} did not record the pending change`);
  }
  return pending;
}

// Drop a scheduled change: the customer keeps their current plan, and it keeps
// renewing as before. Releasing (not cancelling) leaves the subscription itself
// completely untouched — cancelling a schedule would cancel the subscription.
export async function releasePlanChange(
  stripe: Stripe,
  scheduleId: string
): Promise<void> {
  try {
    await stripe.subscriptionSchedules.release(scheduleId);
  } catch (err) {
    // Already released/completed schedules throw; the desired end state (no
    // pending change) is already true, so that's a success for our purposes.
    const message = err instanceof Error ? err.message : String(err);
    if (!/released|completed|canceled/i.test(message)) throw err;
    console.warn(`[billing/schedule] release ${scheduleId} skipped: ${message}`);
  }
}
