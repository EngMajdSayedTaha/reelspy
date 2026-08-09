import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe, siteOrigin, isMissingResource } from "@/lib/billing/stripe";
import { getSubscription } from "@/lib/billing/subscription";
import { usableCustomerId } from "@/lib/billing/sync";
import { stripePriceIdForTier } from "@/lib/billing/plans";
import { loadCatalog, currentPrice, planDisplayName, isSellablePlan } from "@/lib/billing/catalog";
import {
  cancelScheduledChangeForUser,
  changePlanForUser,
  setSubscriptionCancellation,
} from "@/lib/billing/plan-change";
import { scheduleIdOf } from "@/lib/billing/schedule";
import {
  clampCustomConfig,
  computeCustomEntitlements,
  computeCustomPriceAed,
  type CustomPlanConfig,
} from "@/lib/billing/custom-pricing";
import { planSelectionSchema, INVALID_PLAN_MESSAGE } from "@/lib/billing/checkout-schema";

// Buy a plan (L6 / B1, B4). Three situations behind one endpoint:
//
//   NO active subscription → Stripe Checkout. The plan starts now, because
//   there's no paid period to protect; returns { url } to redirect to.
//
//   ALREADY subscribed, moving UP → applied immediately, with only the prorated
//   difference invoiced for the rest of the current period; returns
//   { upgraded: true, chargedLabel, … }.
//
//   ALREADY subscribed, moving DOWN (or sideways) → SCHEDULED for the end of the
//   period the user has already paid for. Nothing charged, nothing taken away
//   today; returns { scheduled: true, effectiveOnLabel, … }.
//
// Which of the last two applies is decided server-side from the real Stripe
// amounts (lib/billing/plan-change.ts), never from what the client asserts.
// Picking the plan they're already on means "keep it": that cancels a scheduled
// change or a pending cancellation instead of booking a new one.
//
// The custom plan's price + entitlements are always recomputed server-side from
// the submitted config (lib/billing/custom-pricing.ts) — the client's live
// preview is UI-only and never trusted as the charged amount.

// A subscription id our row still points at but Stripe no longer has isn't an
// error the user can act on — treat it as "not subscribed" and let them check
// out fresh instead of dead-ending on a 502.
async function liveSubscription(
  stripe: Stripe,
  subscriptionId: string
): Promise<Stripe.Subscription | null> {
  try {
    return await stripe.subscriptions.retrieve(subscriptionId);
  } catch (err) {
    if (isMissingResource(err)) {
      console.warn(`[billing/checkout] stale subscription ${subscriptionId} — falling back to checkout`);
      return null;
    }
    throw err;
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "Billing isn't available yet." }, { status: 503 });
  }

  const rawBody = await request.json().catch(() => ({}));
  const parsed = planSelectionSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: INVALID_PLAN_MESSAGE }, { status: 400 });
  }
  // Shape alone proves nothing: confirm against the catalog that this is a real,
  // published, purchasable plan before we take anyone's money for it.
  const catalog = await loadCatalog();
  if (!isSellablePlan(catalog, parsed.data.tier)) {
    return NextResponse.json({ error: INVALID_PLAN_MESSAGE }, { status: 400 });
  }

  const admin = createAdminClient();
  const existing = await getSubscription(admin, user.id);
  const tier = parsed.data.tier;
  const config: CustomPlanConfig | undefined =
    parsed.data.tier === "custom" && parsed.data.config
      ? clampCustomConfig(parsed.data.config)
      : undefined;

  // ── Existing subscriber: schedule the change for the next renewal ──────────
  if (existing?.active && existing.stripeSubscriptionId) {
    let live: Stripe.Subscription | null;
    try {
      live = await liveSubscription(stripe, existing.stripeSubscriptionId);
    } catch (err) {
      console.error("[billing/checkout] Stripe error:", err instanceof Error ? err.message : err);
      return NextResponse.json({ error: "Could not reach Stripe. Please try again." }, { status: 502 });
    }

    if (live) {
      const subscriptionId = live.id;

      // Choosing the plan you're already on = "keep it". A custom subscriber is
      // excluded: re-submitting the sliders is a real change of configuration.
      if (tier === existing.tier && tier !== "custom") {
        if (scheduleIdOf(live)) {
          const kept = await cancelScheduledChangeForUser({ admin, stripe, userId: user.id, subscriptionId });
          if (!kept.ok) return NextResponse.json({ error: kept.error }, { status: kept.status });
          return NextResponse.json({ kept: true, tier, tierName: await planDisplayName(tier) });
        }
        if (live.cancel_at_period_end) {
          const resumed = await setSubscriptionCancellation({
            admin,
            stripe,
            userId: user.id,
            subscriptionId,
            cancel: false,
          });
          if (!resumed.ok) return NextResponse.json({ error: resumed.error }, { status: resumed.status });
          return NextResponse.json({ resumed: true, tier, tierName: await planDisplayName(tier) });
        }
        return NextResponse.json({ kept: true, tier, tierName: await planDisplayName(tier) });
      }

      const changed = await changePlanForUser({
        admin,
        stripe,
        userId: user.id,
        subscriptionId,
        currentTier: existing.tier,
        tier,
        config,
      });
      if (!changed.ok) {
        return NextResponse.json({ error: changed.error }, { status: changed.status });
      }
      if (changed.mode === "immediate") {
        return NextResponse.json({
          upgraded: true,
          tier: changed.tier,
          tierName: changed.tierName,
          direction: changed.direction,
          chargedLabel: changed.chargedLabel,
          invoiceUrl: changed.invoiceUrl,
          invoicePaid: changed.invoicePaid,
          renewsOnLabel: changed.renewsOnLabel,
        });
      }
      return NextResponse.json({
        scheduled: true,
        tier: changed.tier,
        tierName: changed.tierName,
        effectiveAt: changed.effectiveAt,
        effectiveOnLabel: changed.effectiveOnLabel,
        priceAed: changed.priceAed,
        direction: changed.direction,
      });
    }
  }

  // ── New subscriber: Stripe Checkout ───────────────────────────────────────
  let lineItem: Stripe.Checkout.SessionCreateParams.LineItem;
  let metadata: Record<string, string>;

  if (config) {
    const priceAed = computeCustomPriceAed(config);
    const entitlements = computeCustomEntitlements(config);
    lineItem = {
      price_data: {
        currency: "aed",
        unit_amount: priceAed * 100,
        recurring: { interval: "month" },
        product_data: { name: "ReelSpy Custom Plan" },
      },
      quantity: 1,
    };
    metadata = { user_id: user.id, tier: "custom", custom_entitlements: JSON.stringify(entitlements) };
  } else {
    // The catalog decides which Stripe Price a plan sells; the env var is the
    // fallback for a deployment whose catalog hasn't been seeded yet.
    const priceId =
      currentPrice(catalog, tier)?.stripePriceId ?? stripePriceIdForTier(tier);
    if (!priceId) {
      return NextResponse.json({ error: "That plan isn't available for purchase yet." }, { status: 503 });
    }
    lineItem = { price: priceId, quantity: 1 };
    metadata = { user_id: user.id, tier };
  }

  // Reuse an existing Stripe customer (fetched above) so payment history stays on
  // one record — but only after confirming it still exists, since a customer
  // deleted in the Stripe dashboard would otherwise 502 every checkout forever.
  let customerId: string | null = null;

  try {
    customerId = await usableCustomerId(admin, stripe, user.id, existing?.stripeCustomerId);
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { user_id: user.id },
      });
      customerId = customer.id;
      // Persist immediately so the webhook can map customer→user even if the
      // user abandons checkout and comes back later.
      await admin
        .from("subscriptions")
        .upsert({ user_id: user.id, stripe_customer_id: customerId }, { onConflict: "user_id" });
    }

    // Trials are once per customer, enforced by us: Stripe has no per-customer
    // trial lock for Checkout, so without this a customer could take a fresh
    // trial on every plan, forever. trial_used_at is stamped optimistically here
    // (before they even finish checkout) so opening several sessions can't win a
    // race, and confirmed when the webhook first sees status=trialing.
    const plan = catalog.bySlug.get(tier);
    const trialDays = plan?.trialDays ?? 0;
    const trialEligible = trialDays > 0 && !existing?.trialUsedAt;

    const origin = siteOrigin(request);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [lineItem],
      client_reference_id: user.id,
      // Redundant metadata so the webhook can recover the user from either the
      // session or the subscription object, whichever event fires.
      metadata,
      subscription_data: {
        metadata,
        ...(trialEligible
          ? {
              trial_period_days: trialDays,
              // A trial that ends with no usable card should stop, not silently
              // fail an invoice and drag the customer through dunning.
              trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
            }
          : {}),
      },
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      success_url: `${origin}/dashboard/billing?checkout=success`,
      cancel_url: `${origin}/dashboard/billing?checkout=cancelled`,
    });

    if (!session.url) {
      return NextResponse.json({ error: "Could not start checkout." }, { status: 502 });
    }

    if (trialEligible) {
      await admin
        .from("subscriptions")
        .upsert(
          { user_id: user.id, trial_used_at: new Date().toISOString() },
          { onConflict: "user_id" }
        )
        // A database without the trial column simply doesn't offer trials yet;
        // never fail a checkout over bookkeeping.
        .then(undefined, () => undefined);
    }

    return NextResponse.json({ url: session.url, trialDays: trialEligible ? trialDays : 0 });
  } catch (err) {
    console.error("[billing/checkout] Stripe error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Could not start checkout. Please try again." }, { status: 502 });
  }
}
