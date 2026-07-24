import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe, siteOrigin, isMissingResource } from "@/lib/billing/stripe";
import { getSubscription } from "@/lib/billing/subscription";
import { syncSubscription, usableCustomerId } from "@/lib/billing/sync";
import { stripePriceIdForTier, isPaidTier } from "@/lib/billing/plans";
import {
  CUSTOM_PLAN_RANGE,
  clampCustomConfig,
  computeCustomEntitlements,
  computeCustomPriceAed,
  type CustomPlanConfig,
} from "@/lib/billing/custom-pricing";

// Start a Stripe Checkout session for a paid tier (L6 / B1), or for a
// dynamically-configured "custom" plan (B4). Returns { url } to redirect the
// browser to. Reuses the user's Stripe customer when we already have one (from
// a prior checkout) so their payment history stays on one record.
//
// The custom price + entitlements are always recomputed server-side from the
// submitted config (lib/billing/custom-pricing.ts) — the client's live preview
// is UI-only and never trusted as the charged amount.

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
  if (parsed.data.tier !== "custom" && !isPaidTier(parsed.data.tier)) {
    return NextResponse.json({ error: "Pick a valid plan." }, { status: 400 });
  }

  const admin = createAdminClient();
  const existing = await getSubscription(admin, user.id);

  // In-place SWITCH: an active subscriber changing to a different FIXED tier
  // updates their existing subscription (with proration) instead of opening a
  // second one — this is the smooth "Switch plan" path. Custom-plan switches
  // still go through Checkout (their price is ad-hoc, built per-config below).
  if (existing?.active && existing.stripeSubscriptionId && parsed.data.tier !== "custom") {
    const priceId = stripePriceIdForTier(parsed.data.tier);
    if (!priceId) {
      return NextResponse.json({ error: "That plan isn't available for purchase yet." }, { status: 503 });
    }
    try {
      const current = await stripe.subscriptions.retrieve(existing.stripeSubscriptionId);
      const itemId = current.items.data[0]?.id;
      if (!itemId) throw new Error("subscription has no line item to switch");
      const updated = await stripe.subscriptions.update(existing.stripeSubscriptionId, {
        items: [{ id: itemId, price: priceId }],
        proration_behavior: "create_prorations",
        cancel_at_period_end: false, // switching un-cancels a pending cancellation
        metadata: { user_id: user.id, tier: parsed.data.tier },
      });
      // Reflect the new tier immediately so the billing page updates on reload
      // without waiting on the webhook (which re-syncs the same row, idempotently).
      await syncSubscription(admin, updated);
      return NextResponse.json({ switched: true, tier: parsed.data.tier });
    } catch (err) {
      // A subscription id our row still points at but Stripe no longer has isn't
      // an error the user can act on — treat it as "not subscribed" and fall
      // through to Checkout instead of dead-ending on a 502.
      if (!isMissingResource(err)) {
        console.error("[billing/checkout] switch error:", err instanceof Error ? err.message : err);
        return NextResponse.json({ error: "Could not switch your plan. Please try again." }, { status: 502 });
      }
      console.warn(`[billing/checkout] stale subscription ${existing.stripeSubscriptionId} — falling back to checkout`);
    }
  }

  let lineItem: Stripe.Checkout.SessionCreateParams.LineItem;
  let metadata: Record<string, string>;

  if (parsed.data.tier === "custom") {
    const config: CustomPlanConfig = clampCustomConfig(parsed.data.config);
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
    const priceId = stripePriceIdForTier(parsed.data.tier);
    if (!priceId) {
      return NextResponse.json({ error: "That plan isn't available for purchase yet." }, { status: 503 });
    }
    lineItem = { price: priceId, quantity: 1 };
    metadata = { user_id: user.id, tier: parsed.data.tier };
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
