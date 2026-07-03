// Reads the user's subscription row and resolves it to an AiTier (L6 / B1).
// This is the bridge between the Stripe-written `subscriptions` table and both
// consumers of tier: AI model routing (lib/ai/tier.ts) and feature entitlements
// (lib/billing/entitlements.ts).
//
// Fail-open: any error (table not migrated yet, transient DB failure) is treated
// as "no active paid subscription" so callers fall back to the env default tier
// — the same posture as the rate limiter. Billing infra must never hard-break a
// feature.

import type { SupabaseClient } from "@supabase/supabase-js";
import { isAiTier, type AiTier } from "@/lib/ai/tier";

// Stripe statuses that grant paid access. `past_due` still has access during the
// dunning window; `canceled`/`unpaid`/`incomplete_expired` do not.
const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

export type Subscription = {
  tier: AiTier;
  status: string;
  active: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

// Fetch the raw subscription row for a user, or null if none / not migrated.
export async function getSubscription(
  supabase: SupabaseClient,
  userId: string
): Promise<Subscription | null> {
  try {
    const { data, error } = await supabase
      .from("subscriptions")
      .select(
        "tier, status, stripe_customer_id, stripe_subscription_id, current_period_end, cancel_at_period_end"
      )
      .eq("user_id", userId)
      .maybeSingle();

    if (error || !data) return null;

    const tier: AiTier = isAiTier(data.tier) ? (data.tier as AiTier) : "free";
    const status = typeof data.status === "string" ? data.status : "inactive";
    return {
      tier,
      status,
      active: ACTIVE_STATUSES.has(status),
      stripeCustomerId: data.stripe_customer_id ?? null,
      stripeSubscriptionId: data.stripe_subscription_id ?? null,
      currentPeriodEnd: data.current_period_end ?? null,
      cancelAtPeriodEnd: Boolean(data.cancel_at_period_end),
    };
  } catch {
    return null;
  }
}

// The tier granted by an ACTIVE subscription, or null when the user has none
// (so the caller can apply its own fallback — env default in resolveUserTier).
export async function activeTierFromSubscription(
  supabase: SupabaseClient,
  userId: string
): Promise<AiTier | null> {
  const sub = await getSubscription(supabase, userId);
  if (sub && sub.active) return sub.tier;
  return null;
}
