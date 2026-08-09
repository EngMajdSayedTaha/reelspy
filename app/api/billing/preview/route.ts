import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/billing/stripe";
import { getSubscription } from "@/lib/billing/subscription";
import { isPaidTier } from "@/lib/billing/plans";
import { previewPlanChangeForUser, requireActiveSubscription } from "@/lib/billing/plan-change";
import { clampCustomConfig } from "@/lib/billing/custom-pricing";
import { planSelectionSchema, INVALID_PLAN_MESSAGE } from "@/lib/billing/checkout-schema";

// What would happen if I confirmed? Read-only companion to /api/billing/checkout
// for a subscriber who is changing plans: it runs the SAME decision the write
// path runs (upgrade → now with a prorated charge, otherwise → next renewal) and
// asks Stripe for the exact prorated figure, so the confirmation dialog can
// state the real number instead of a hedge.
//
// Nothing here writes: worst case it fails and the dialog falls back to generic
// wording, which is why every failure returns a plain message rather than
// blocking the change.

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

  const parsed = planSelectionSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success || !isPaidTier(parsed.data.tier)) {
    return NextResponse.json({ error: INVALID_PLAN_MESSAGE }, { status: 400 });
  }

  const admin = createAdminClient();
  const sub = await getSubscription(admin, user.id);
  const guard = requireActiveSubscription(sub);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const preview = await previewPlanChangeForUser({
    stripe,
    userId: user.id,
    subscriptionId: guard.subscriptionId,
    currentTier: sub?.tier ?? "free",
    tier: parsed.data.tier,
    config: parsed.data.tier === "custom" ? clampCustomConfig(parsed.data.config) : undefined,
  });
  if (!preview.ok) {
    return NextResponse.json({ error: preview.error }, { status: preview.status });
  }

  return NextResponse.json({
    mode: preview.mode,
    direction: preview.direction,
    tier: preview.tier,
    tierName: preview.tierName,
    priceLabel: preview.priceLabel,
    chargeTodayLabel: preview.chargeTodayLabel,
    effectiveOnLabel: preview.effectiveOnLabel,
    renewsOnLabel: preview.renewsOnLabel,
  });
}
