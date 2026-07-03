import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe, siteOrigin } from "@/lib/billing/stripe";
import { getSubscription } from "@/lib/billing/subscription";
import { stripePriceIdForTier, isPaidTier } from "@/lib/billing/plans";

// Start a Stripe Checkout session for a paid tier (L6 / B1). Returns { url } to
// redirect the browser to. Reuses the user's Stripe customer when we already
// have one (from a prior checkout) so their payment history stays on one record.

const bodySchema = z.object({
  tier: z.enum(["creator", "pro", "studio"]),
});

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
  if (!parsed.success || !isPaidTier(parsed.data.tier)) {
    return NextResponse.json({ error: "Pick a valid plan." }, { status: 400 });
  }

  const priceId = stripePriceIdForTier(parsed.data.tier);
  if (!priceId) {
    return NextResponse.json({ error: "That plan isn't available for purchase yet." }, { status: 503 });
  }

  // Reuse an existing Stripe customer (admin client bypasses RLS to read the row
  // even though the browser role could too). Create one the first time.
  const admin = createAdminClient();
  const existing = await getSubscription(admin, user.id);
  let customerId = existing?.stripeCustomerId ?? null;

  try {
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
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: user.id,
      // Redundant metadata so the webhook can recover the user from either the
      // session or the subscription object, whichever event fires.
      metadata: { user_id: user.id, tier: parsed.data.tier },
      subscription_data: { metadata: { user_id: user.id, tier: parsed.data.tier } },
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
