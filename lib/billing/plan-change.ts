// In-app plan-change service — the one place the billing UI's write actions are
// implemented, so /api/billing/checkout and /api/billing/plan stay thin and the
// billing policy can't be half-applied by one of them.
//
// THE POLICY, in one place:
//
//   UPGRADE (the new plan costs MORE) → applies immediately. The customer wanted
//   more capacity now, so they get it now and Stripe invoices only the prorated
//   difference for the days left in the period they already paid for. They are
//   never charged twice for the same days.
//
//   DOWNGRADE or a same-price change (the new plan costs the SAME or LESS) →
//   applies at the end of the period they already paid for. They keep the plan
//   they bought until the day it runs out; the cheaper plan starts at the next
//   renewal. Nothing is prorated, refunded, or taken away early.
//
// Which one applies is decided HERE, from the real Stripe amounts (not from the
// plan ladder or anything the client sent), and the UI is told the answer — see
// previewPlanChangeForUser, which the confirmation dialog reads so the customer
// sees the exact figure before agreeing to it.
//
// Every action drives Stripe first, re-syncs our row from the fresh Stripe object
// (so the billing page is correct on the very next render instead of waiting for
// the webhook), and then notifies. The webhook re-does all of it idempotently.

import "server-only";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiTier } from "@/lib/ai/tier";
import { normalizeCurrency, type Currency } from "@/lib/billing/currency";
import { planFor, stripePriceIdForTier } from "@/lib/billing/plans";
import {
  loadCatalog,
  currentPrice,
  planDisplayName,
  customRatesFrom,
  type BillingInterval,
} from "@/lib/billing/catalog";
import { syncSubscription } from "@/lib/billing/sync";
import { notifySubscriptionChange, emailForUser, subscriptionAmountLabel } from "@/lib/billing/notify";
import { dayLabel, dayLabelFromUnix, planChangeDirection, type PlanChangeDirection } from "@/lib/billing/format";
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
import {
  formatMoney,
  sendPlanChangeApplied,
  sendPlanChangeCancelled,
  sendPlanChangeScheduled,
} from "@/lib/email/billing";

export type ActionFailure = { ok: false; status: number; error: string };

export type ScheduledChange = {
  ok: true;
  mode: "scheduled";
  tier: AiTier;
  tierName: string;
  /** ISO timestamp the new plan takes over (= current period end). */
  effectiveAt: string;
  effectiveOnLabel: string | null;
  priceAed: number | null;
  direction: PlanChangeDirection;
};

export type ImmediateChange = {
  ok: true;
  mode: "immediate";
  tier: AiTier;
  tierName: string;
  direction: PlanChangeDirection;
  priceAed: number | null;
  /** What Stripe actually invoiced for the rest of this period, if anything. */
  chargedLabel: string | null;
  invoiceUrl: string | null;
  invoicePaid: boolean;
  renewsOnLabel: string | null;
};

// What the confirmation dialog needs to state the consequences exactly.
export type PlanChangePreview = {
  ok: true;
  mode: "immediate" | "scheduled";
  direction: PlanChangeDirection;
  tier: AiTier;
  tierName: string;
  /** Recurring price of the target plan, e.g. "AED 149". */
  priceLabel: string | null;
  /** Prorated amount due today — immediate upgrades only. */
  chargeTodayLabel: string | null;
  /** When the change lands (immediate: today; scheduled: the renewal date). */
  effectiveOnLabel: string | null;
  renewsOnLabel: string | null;
};

// A target price plus what it actually costs, which is what decides immediate vs
// scheduled. Amounts come from Stripe (the configured Price), never from the
// display prices in plans.ts.
type ResolvedTarget = PlanChangeTarget & {
  unitAmount: number | null;
  currency: string | null;
  interval: BillingInterval;
};

// Resolve what the new plan bills: a fixed tier's configured Stripe Price, or an
// ad-hoc monthly Price built from a validated custom config.
async function resolveTarget(
  stripe: Stripe,
  userId: string,
  tier: AiTier,
  config?: CustomPlanConfig,
  // The currency this subscription is LOCKED to. Stripe can't change a
  // subscription's currency, so a target priced in anything else is one we could
  // never actually charge — and decidePlanChangeMode would refuse to compare it
  // and defer the change instead of applying it.
  billingCurrency?: Currency
): Promise<ResolvedTarget | ActionFailure> {
  if (tier === "custom") {
    if (!config) return { ok: false, status: 400, error: "Pick your custom plan options first." };
    const clamped = clampCustomConfig(config);
    const priceAed = computeCustomPriceAed(clamped, customRatesFrom(await loadCatalog()));
    const entitlements = computeCustomEntitlements(clamped);
    const priceId = await customPlanPriceId(stripe, priceAed);
    return {
      userId,
      tier,
      priceId,
      priceAed,
      entitlements,
      unitAmount: priceAed * 100,
      amountMinor: priceAed * 100,
      currency: "aed",
      // The build-your-own rate card prices a month at a time.
      interval: "month",
    };
  }

  const catalog = await loadCatalog();
  const catalogPrice = currentPrice(catalog, tier, { currency: billingCurrency });
  if (billingCurrency && catalogPrice && catalogPrice.currency !== billingCurrency) {
    // This plan isn't priced in the currency they're billed in. Saying so beats
    // quoting a price we can't charge, or silently deferring the change.
    return {
      ok: false,
      status: 409,
      error: `That plan isn't available in ${billingCurrency.toUpperCase()}. Contact support and we'll move you across.`,
    };
  }
  // The catalog is authoritative for WHICH price a plan sells; env price ids are
  // the fallback for a deployment whose catalog hasn't been seeded yet.
  const priceId = catalogPrice?.stripePriceId ?? stripePriceIdForTier(tier);
  if (!priceId) {
    return { ok: false, status: 503, error: "That plan isn't available for purchase yet." };
  }
  // Stripe's own Price object stays the authority on what this tier COSTS — the
  // catalog amount is what we print, and the two could differ if a price was
  // edited in the Stripe dashboard. The money decision must follow the money.
  let unitAmount: number | null = null;
  let currency: string | null = null;
  let interval: BillingInterval = catalogPrice?.interval ?? "month";
  try {
    const price = await stripe.prices.retrieve(priceId);
    unitAmount = price.unit_amount ?? null;
    currency = price.currency ?? null;
    if (price.recurring?.interval === "year" || price.recurring?.interval === "month") {
      interval = price.recurring.interval;
    }
  } catch (err) {
    console.warn(
      "[billing/plan-change] price lookup failed, falling back to the plan ladder:",
      err instanceof Error ? err.message : err
    );
  }
  return {
    userId,
    tier,
    priceId,
    priceAed: catalogPrice ? Math.round(catalogPrice.unitAmount / 100) : planFor(tier).priceAed || null,
    entitlements: null,
    unitAmount,
    amountMinor: unitAmount,
    currency,
    interval,
  };
}

function isFailure<T>(value: T | ActionFailure): value is ActionFailure {
  return typeof value === "object" && value !== null && "ok" in value && value.ok === false;
}

// The currency this subscription is locked to, if we can read it.
function currencyOf(sub: Stripe.Subscription): Currency | undefined {
  return normalizeCurrency(sub.items?.data?.[0]?.price?.currency) ?? undefined;
}

// The recurring amount the subscription bills today, and over what period.
function currentAmountOf(sub: Stripe.Subscription): {
  amount: number | null;
  currency: string | null;
  interval: BillingInterval;
} {
  const price = sub.items?.data?.[0]?.price;
  return {
    amount: price?.unit_amount ?? null,
    currency: price?.currency ?? null,
    interval: price?.recurring?.interval === "year" ? "year" : "month",
  };
}

const MONTHS_IN: Record<BillingInterval, number> = { month: 1, year: 12 };

// Compare two recurring prices on a like-for-like basis when their billing
// periods differ. A yearly price is a bigger NUMBER than a monthly one without
// being a bigger commitment per month — Creator at 490/year would otherwise read
// as an upgrade from Studio at 349/month.
//
// Cross-MULTIPLIED rather than divided: integer division would round two
// genuinely different prices into looking equal, and this decides whether
// somebody is charged today.
function compareMonthlyEquivalent(
  a: { amount: number; interval: BillingInterval },
  b: { amount: number; interval: BillingInterval }
): number {
  const left = a.amount * MONTHS_IN[b.interval];
  const right = b.amount * MONTHS_IN[a.interval];
  return left === right ? 0 : left > right ? 1 : -1;
}

// Upgrade or not? Decided on money: a plan that costs more per month is an
// upgrade and applies now; anything else waits for the renewal. Comparing real
// amounts (rather than the plan ladder) is what makes this correct for custom
// plans, promotional prices, and any tier whose Stripe Price differs from the
// number on the pricing card. Only when Stripe's amounts aren't comparable —
// missing, or a different currency — do we fall back to the ladder, and an
// unknown comparison defers rather than charging.
export function decidePlanChangeMode(
  sub: Stripe.Subscription,
  currentTier: AiTier,
  target: {
    tier: AiTier;
    unitAmount: number | null;
    currency: string | null;
    interval?: BillingInterval;
  },
  ladder?: readonly AiTier[]
): { immediate: boolean; direction: PlanChangeDirection } {
  const current = currentAmountOf(sub);
  const comparable =
    current.amount !== null &&
    target.unitAmount !== null &&
    current.currency !== null &&
    target.currency !== null &&
    current.currency === target.currency;

  if (comparable) {
    const targetInterval: BillingInterval = target.interval ?? "month";
    const cmp = compareMonthlyEquivalent(
      { amount: target.unitAmount as number, interval: targetInterval },
      { amount: current.amount as number, interval: current.interval }
    );

    if (cmp !== 0) {
      const up = cmp > 0;
      return { immediate: up, direction: up ? "upgrade" : "downgrade" };
    }

    // Same money per month, different commitment. Lengthening the period is an
    // upgrade — the customer pre-pays for longer, so they're charged now, and
    // Stripe prorates the difference. Shortening it is a downgrade and waits for
    // the renewal, which for an annual subscriber can be up to a year out. That
    // is correct: they paid for the year.
    if (targetInterval !== current.interval) {
      const lengthening = MONTHS_IN[targetInterval] > MONTHS_IN[current.interval];
      return { immediate: lengthening, direction: lengthening ? "upgrade" : "downgrade" };
    }

    return { immediate: false, direction: "change" };
  }

  const direction = planChangeDirection(currentTier, target.tier, ladder);
  return { immediate: direction === "upgrade", direction };
}

// The ladder as the catalog currently orders it, for the fallback path above.
async function catalogLadder(): Promise<AiTier[]> {
  return (await loadCatalog()).ladder as AiTier[];
}

// THE entry point for "the user picked a different plan". Works out whether that
// is an upgrade (apply now, invoice the difference) or not (start it at the next
// renewal) and carries it out.
export async function changePlanForUser(params: {
  admin: SupabaseClient;
  stripe: Stripe;
  userId: string;
  subscriptionId: string;
  currentTier: AiTier;
  tier: AiTier;
  config?: CustomPlanConfig;
}): Promise<ImmediateChange | ScheduledChange | ActionFailure> {
  const { admin, stripe, userId, subscriptionId, currentTier, tier, config } = params;

  // Retrieved BEFORE the target is resolved: the subscription's currency is
  // locked for its lifetime, and it's what the new plan has to be priced in.
  let sub: Stripe.Subscription;
  try {
    sub = await stripe.subscriptions.retrieve(subscriptionId);
  } catch (err) {
    console.error("[billing/plan-change] retrieve failed:", err instanceof Error ? err.message : err);
    return { ok: false, status: 502, error: "Could not reach Stripe. Please try again." };
  }

  const target = await resolveTarget(stripe, userId, tier, config, currencyOf(sub));
  if (isFailure(target)) return target;

  const { immediate, direction } = decidePlanChangeMode(sub, currentTier, target, await catalogLadder());
  return immediate
    ? applyPlanChangeNow({ admin, stripe, sub, userId, currentTier, target, direction })
    : schedulePlanChangeAtPeriodEnd({ admin, stripe, sub, userId, currentTier, target, direction });
}

// Tell the UI what confirming would do — the same decision, same numbers, no
// side effects. The dialog quotes this back to the customer before they agree.
export async function previewPlanChangeForUser(params: {
  stripe: Stripe;
  userId: string;
  subscriptionId: string;
  currentTier: AiTier;
  tier: AiTier;
  config?: CustomPlanConfig;
}): Promise<PlanChangePreview | ActionFailure> {
  const { stripe, userId, subscriptionId, currentTier, tier, config } = params;

  let sub: Stripe.Subscription;
  try {
    sub = await stripe.subscriptions.retrieve(subscriptionId);
  } catch (err) {
    console.error("[billing/plan-change] preview retrieve failed:", err instanceof Error ? err.message : err);
    return { ok: false, status: 502, error: "Could not reach Stripe. Please try again." };
  }

  const target = await resolveTarget(stripe, userId, tier, config, currencyOf(sub));
  if (isFailure(target)) return target;

  const { immediate, direction } = decidePlanChangeMode(sub, currentTier, target, await catalogLadder());
  const renewsOnLabel = dayLabelFromUnix(sub.current_period_end);
  const priceLabel =
    target.unitAmount !== null
      ? formatMoney(target.unitAmount, target.currency)
      : target.priceAed
        ? `AED ${target.priceAed}`
        : null;

  return {
    ok: true,
    mode: immediate ? "immediate" : "scheduled",
    direction,
    tier,
    tierName: await planDisplayName(tier),
    priceLabel,
    chargeTodayLabel: immediate ? await previewProration(stripe, sub, target.priceId) : null,
    effectiveOnLabel: immediate ? dayLabel(new Date()) : renewsOnLabel,
    renewsOnLabel,
  };
}

// What Stripe would invoice right now for switching mid-period: the charge for
// the new plan's remaining days MINUS the credit for the old plan's unused days.
// Read off the proration line items rather than the preview's amount_due, which
// also carries the next cycle's charge. Null when it can't be computed or works
// out to zero-or-credit — the UI then says "nothing today" instead of guessing.
async function previewProration(
  stripe: Stripe,
  sub: Stripe.Subscription,
  priceId: string
): Promise<string | null> {
  const itemId = sub.items?.data?.[0]?.id;
  if (!itemId) return null;
  const prorationDate = Math.floor(Date.now() / 1000);
  try {
    const upcoming = await stripe.invoices.retrieveUpcoming({
      customer: typeof sub.customer === "string" ? sub.customer : sub.customer?.id,
      subscription: sub.id,
      subscription_details: {
        items: [{ id: itemId, price: priceId }],
        proration_behavior: "always_invoice",
        proration_date: prorationDate,
      },
    });
    const prorated = (upcoming.lines?.data ?? [])
      .filter((line) => line.proration && line.period?.start === prorationDate)
      .reduce((sum, line) => sum + (line.amount ?? 0), 0);
    return prorated > 0 ? formatMoney(prorated, upcoming.currency) : null;
  } catch (err) {
    // A preview is a nicety; never block the change on it.
    console.warn(
      "[billing/plan-change] proration preview failed:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

// UPGRADE: swap the plan now and let Stripe invoice the prorated difference for
// the remainder of the current period. The customer is credited for the days
// they'd already paid for on the old plan, so they never pay twice for the same
// days, and their new limits are live the moment this returns.
async function applyPlanChangeNow(params: {
  admin: SupabaseClient;
  stripe: Stripe;
  sub: Stripe.Subscription;
  userId: string;
  currentTier: AiTier;
  target: ResolvedTarget;
  direction: PlanChangeDirection;
}): Promise<ImmediateChange | ActionFailure> {
  const { admin, stripe, sub, userId, currentTier, target, direction } = params;

  const itemId = sub.items?.data?.[0]?.id;
  if (!itemId) {
    return { ok: false, status: 409, error: "Your subscription has no plan to change." };
  }

  let updated: Stripe.Subscription;
  try {
    // Stripe refuses item updates while a schedule manages the subscription, and
    // a leftover phase would drag them back down later anyway — so a pending
    // downgrade is dropped when the customer upgrades over the top of it.
    const scheduleId = scheduleIdOf(sub);
    if (scheduleId) await releasePlanChange(stripe, scheduleId);

    updated = await stripe.subscriptions.update(sub.id, {
      items: [{ id: itemId, price: target.priceId }],
      // Invoice the difference now instead of parking it on the next bill: the
      // customer sees one charge for the upgrade they just asked for.
      proration_behavior: "always_invoice",
      cancel_at_period_end: false, // upgrading un-cancels a pending cancellation
      metadata: {
        user_id: userId,
        tier: target.tier,
        // Empty string clears the key — a fixed tier must not inherit the
        // previous custom plan's limits.
        custom_entitlements: target.entitlements ? JSON.stringify(target.entitlements) : "",
      },
      expand: ["latest_invoice"],
    });
  } catch (err) {
    console.error("[billing/plan-change] immediate upgrade failed:", err instanceof Error ? err.message : err);
    return { ok: false, status: 502, error: "Could not change your plan. Please try again." };
  }

  // The invoice Stripe just raised for the proration (guarded by billing_reason
  // so a stale latest_invoice from the last cycle can't be reported as today's
  // charge).
  const invoice =
    updated.latest_invoice && typeof updated.latest_invoice === "object" ? updated.latest_invoice : null;
  const prorationInvoice = invoice?.billing_reason === "subscription_update" ? invoice : null;
  const chargedLabel =
    prorationInvoice && prorationInvoice.amount_due > 0
      ? formatMoney(prorationInvoice.amount_due, prorationInvoice.currency)
      : null;

  const result = await syncSubscription(admin, updated, stripe).catch((err) => {
    console.warn("[billing/plan-change] post-upgrade sync failed:", err instanceof Error ? err.message : err);
    return null;
  });
  // Both emails below are ours to send, with the numbers this path knows about —
  // so the generic diff-notifier must not duplicate them.
  if (result) {
    await notifySubscriptionChange(admin, updated, result, {
      suppressResumed: true,
      suppressPlanChange: true,
    });
  }

  const renewsOnLabel = dayLabelFromUnix(updated.current_period_end);
  const to = await emailForUser(admin, userId);
  if (to) {
    await sendPlanChangeApplied({
      to,
      previousTierName: await planDisplayName(currentTier),
      tier: target.tier,
      tierName: await planDisplayName(target.tier),
      entitlements: target.entitlements,
      amountLabel: subscriptionAmountLabel(updated),
      renewsOnLabel,
      immediate: true,
      chargedLabel,
      invoiceUrl: prorationInvoice?.hosted_invoice_url ?? null,
    });
  }

  return {
    ok: true,
    mode: "immediate",
    tier: target.tier,
    tierName: await planDisplayName(target.tier),
    direction,
    priceAed: target.priceAed,
    chargedLabel,
    invoiceUrl: prorationInvoice?.hosted_invoice_url ?? null,
    invoicePaid: prorationInvoice ? prorationInvoice.status === "paid" : true,
    renewsOnLabel,
  };
}

// DOWNGRADE (or a same-price change): book `tier` to start at the end of the
// period the user has already paid for.
async function schedulePlanChangeAtPeriodEnd(params: {
  admin: SupabaseClient;
  stripe: Stripe;
  sub: Stripe.Subscription;
  userId: string;
  currentTier: AiTier;
  target: ResolvedTarget;
  direction: PlanChangeDirection;
}): Promise<ScheduledChange | ActionFailure> {
  const { admin, stripe, sub, userId, currentTier, target, direction } = params;

  let pending;
  try {
    pending = await schedulePlanChange(stripe, sub.id, target);
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
  const fresh = await stripe.subscriptions.retrieve(sub.id).catch(() => null);
  if (fresh) {
    const result = await syncSubscription(admin, fresh, stripe).catch((err) => {
      console.warn("[billing/plan-change] post-schedule sync failed:", err instanceof Error ? err.message : err);
      return null;
    });
    // Scheduling a plan implies staying subscribed; the confirmation email below
    // already says so, so don't also send a "your cancellation was called off".
    if (result) await notifySubscriptionChange(admin, fresh, result, { suppressResumed: true });
  }

  const effectiveOnLabel = dayLabel(pending.effectiveAt);

  const to = await emailForUser(admin, userId);
  if (to && effectiveOnLabel) {
    await sendPlanChangeScheduled({
      to,
      currentTierName: await planDisplayName(currentTier),
      nextTier: target.tier,
      nextTierName: await planDisplayName(target.tier),
      effectiveOnLabel,
      nextPriceLabel: pending.priceAed ? `AED ${pending.priceAed}` : null,
      nextEntitlements: pending.entitlements,
      direction,
    });
  }

  return {
    ok: true,
    mode: "scheduled",
    tier: target.tier,
    tierName: await planDisplayName(target.tier),
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
    if (data?.pending_tier) cancelledTierName = await planDisplayName(data.pending_tier as string);
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
  let tierName = await planDisplayName("free");
  if (fresh) {
    const result = await syncSubscription(admin, fresh, stripe).catch(() => null);
    if (result) tierName = await planDisplayName(result.tier);
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
