import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe, siteOrigin } from "@/lib/billing/stripe";
import { getSubscription } from "@/lib/billing/subscription";

// Open the Stripe Billing Portal (L6 / B1) so a subscriber can update their card,
// change plan, or cancel. Returns { url } to redirect to. Requires an existing
// Stripe customer — a user who never checked out has nothing to manage.

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

  const admin = createAdminClient();
  const sub = await getSubscription(admin, user.id);
  if (!sub?.stripeCustomerId) {
    return NextResponse.json({ error: "No billing account yet — subscribe first." }, { status: 400 });
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${siteOrigin(request)}/dashboard/billing`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[billing/portal] Stripe error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Could not open the billing portal. Please try again." }, { status: 502 });
  }
}
