import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe, siteOrigin, isMissingResource } from "@/lib/billing/stripe";
import { getSubscription } from "@/lib/billing/subscription";
import { usableCustomerId } from "@/lib/billing/sync";
import { stripePriceIdForTier, isPaidTier, planFor } from "@/lib/billing/plans";
import {
  cancelScheduledChangeForUser,
  schedulePlanChangeForUser,
  setSubscriptionCancellation,
} from "@/lib/billing/plan-change";
import { scheduleIdOf } from "@/lib/billing/schedule";
import {
  CUSTOM_PLAN_RANGE,
  clampCustomConfig,
  computeCustomEntitlements,
  computeCustomPriceAed,
  type CustomPlanConfig,
} from "@/lib/billing/custom-pricing";

// Buy a plan (L6 / B1, B4). Two very different situations behind one endpoint:
//
//   NO active subscription → Stripe Checkout. The plan starts now, because
//   there's no paid period to protect; returns { url } to redirect to.
//
//   ALREADY subscribed → the change is SCHEDULED for the end of the period the
//   user has already paid for (lib/billing/plan-change.ts). Nothing is charged
//   or prorated today, nothing about their access changes today; returns
//   { scheduled: true, … } describing exactly when it will. Picking the plan
//   they're already on means "keep it": that cancels a scheduled change or a
//   pending cancellation instead of booking a new one.
//
// The custom plan's price + entitlements are always recomputed server-side from
// the submitted config (lib/billing/custom-pricing.ts) — the client's live
// preview is UI-only and never trusted as the charged amount.

const customConfigSchema = z.object({
  accounts: z.number().int().min(CUSTOM_PLAN_RANGE.accounts.min).max(CUSTOM_PLAN_RANGE.accounts.max),
  scriptsUnlimited: z.boolean(),
  scripts: z.number().int().min(CUSTOM_PLAN_RANGE.scripts.min).max(CUSTOM_PLAN_RANGE.scripts.max),
  automations: z.number().int().min(CUSTOM_PLAN_RANGE.automations.min).max(CUSTOM_PLAN_RANGE.automations.max),
  publishTargets: z
    .number()
    .int()
    .min(CUSTOM_PLAN_RANGE.publishTargets.min)
    .max(CUSTOM_PLAN_RANGE.publishTargets.max),
  model: z.enum(["sonnet", "opus"]),
});

const bodySchema = z.discriminatedUnion("tier", [
  z.object({ tier: z.enum(["creator", "pro", "studio"]) }),
  z.object({ tier: z.literal("custom"), config: customConfigSchema }),
]);

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
  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Pick a valid plan." }, { status: 400 });
  }
  if (!isPaidTier(parsed.data.tier)) {
    return NextResponse.json({ error: "Pick a valid plan." }, { status: 400 });
  }

  const admin = createAdminClient();
  const existing = await getSubscription(admin, user.id);
  const tier = parsed.data.tier;
  const config: CustomPlanConfig | undefined =
    parsed.data.tier === "custom" ? clampCustomConfig(parsed.data.config) : undefined;

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
          return NextResponse.json({ kept: true, tier, tierName: planFor(tier).name });
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
          return NextResponse.json({ resumed: true, tier, tierName: planFor(tier).name });
        }
        return NextResponse.json({ kept: true, tier, tierName: planFor(tier).name });
      }

      const scheduled = await schedulePlanChangeForUser({
        admin,
        stripe,
        userId: user.id,
        subscriptionId,
        currentTier: existing.tier,
        tier,
        config,
      });
      if (!scheduled.ok) {
        return NextResponse.json({ error: scheduled.error }, { status: scheduled.status });
      }
      return NextResponse.json({
        scheduled: true,
        tier: scheduled.tier,
        tierName: scheduled.tierName,
        effectiveAt: scheduled.effectiveAt,
        effectiveOnLabel: scheduled.effectiveOnLabel,
        priceAed: scheduled.priceAed,
        direction: scheduled.direction,
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
    const priceId = stripePriceIdForTier(tier);
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

    const origin = siteOrigin(request);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [lineItem],
      client_reference_id: user.id,
      // Redundant metadata so the webhook can recover the user from either the
      // session or the subscription object, whichever event fires.
      metadata,
      subscription_data: { metadata },
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      success_url: `${origin}/dashboard/billing?checkout=success`,
      cancel_url: `${origin}/dashboard/billing?checkout=cancelled`,
    });

    if (!session.url) {
      return NextResponse.json({ error: "Could not start checkout." }, { status: 502 });
    }
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[billing/checkout] Stripe error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Could not start checkout. Please try again." }, { status: 502 });
  }
}
