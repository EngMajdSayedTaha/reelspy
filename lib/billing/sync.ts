import "server-only";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tierForStripePrice } from "@/lib/billing/plans";
import { isAiTier, type AiTier } from "@/lib/ai/tier";
import { coerceEntitlements, type Entitlements } from "@/lib/billing/entitlements";

// Shared Stripe→subscriptions sync, extracted from the webhook so BOTH the
// webhook (source of truth) and the admin "sync from Stripe" action write the
// row the same way. The subscriptions table stays single-shape regardless of
// which path touched it.

// Statuses that mean "no paid access" — drop the tier back to free so
// entitlements revoke immediately when a sub lapses or is cancelled.
export const INACTIVE_STATUSES = new Set(["canceled", "unpaid", "incomplete_expired"]);

export function customerIdOf(sub: Stripe.Subscription): string | null {
  return typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
}

// Resolve which of OUR user ids a Stripe object belongs to: prefer the metadata
// stamped at checkout, else map the Stripe customer id back via the table.
export async function resolveUserId(
  admin: SupabaseClient,
  metadataUserId: string | undefined,
  customerId: string | null
): Promise<string | null> {
  if (metadataUserId) return metadataUserId;
  if (!customerId) return null;
  const { data } = await admin
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return data?.user_id ?? null;
}

// Derive the tier a subscription grants: the priced plan wins (so a mid-cycle
// plan change is honoured), falling back to the tier stamped in metadata. A
// custom-plan subscription's ad-hoc price never matches a known Stripe Price id,
// so this naturally falls through to the "custom" tier stamped in metadata.
export function tierOfSubscription(sub: Stripe.Subscription): AiTier {
  const priceId = sub.items.data[0]?.price?.id;
  const fromPrice = priceId ? tierForStripePrice(priceId) : null;
  if (fromPrice) return fromPrice;
  const metaTier = sub.metadata?.tier;
  if (isAiTier(metaTier)) return metaTier;
  return "free";
}

// Parse the custom-plan config stamped into metadata at checkout (B4). Returns
// null on any parse/shape failure so callers fall back to ENTITLEMENTS.custom.
export function customEntitlementsOf(sub: Stripe.Subscription): Entitlements | null {
  const raw = sub.metadata?.custom_entitlements;
  if (!raw) return null;
  try {
    return coerceEntitlements(JSON.parse(raw));
  } catch {
    return null;
  }
}

// Upsert the subscriptions row from a Stripe Subscription object. Throws on a DB
// error (the webhook turns that into a 500 so Stripe retries).
export async function syncSubscription(
  admin: SupabaseClient,
  sub: Stripe.Subscription
): Promise<{ userId: string; tier: AiTier; status: string } | null> {
  const customerId = customerIdOf(sub);
  const userId = await resolveUserId(admin, sub.metadata?.user_id, customerId);
  if (!userId) {
    console.warn(`[billing/sync] no user for subscription ${sub.id} (customer ${customerId})`);
    return null;
  }

  const inactive = INACTIVE_STATUSES.has(sub.status);
  const tier: AiTier = inactive ? "free" : tierOfSubscription(sub);
  const customEntitlements = !inactive && tier === "custom" ? customEntitlementsOf(sub) : null;
  const periodEnd = sub.current_period_end
    ? new Date(sub.current_period_end * 1000).toISOString()
    : null;

  const { error } = await admin.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      tier,
      status: sub.status,
      current_period_end: periodEnd,
      cancel_at_period_end: sub.cancel_at_period_end ?? false,
      custom_entitlements: customEntitlements,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (error) throw new Error(error.message);
  return { userId, tier, status: sub.status };
}

// Admin action: re-pull a user's live subscription from Stripe and re-sync the
// row. Finds the Stripe subscription via the stored subscription/customer id.
// Returns a small result describing what happened (for audit + UI feedback).
export async function syncSubscriptionForUser(
  admin: SupabaseClient,
  stripe: Stripe,
  userId: string
): Promise<{ ok: boolean; reason?: string; tier?: AiTier; status?: string }> {
  const { data: row } = await admin
    .from("subscriptions")
    .select("stripe_subscription_id, stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();

  const subId = row?.stripe_subscription_id as string | null | undefined;
  const customerId = row?.stripe_customer_id as string | null | undefined;

  let sub: Stripe.Subscription | null = null;
  if (subId) {
    sub = await stripe.subscriptions.retrieve(subId);
  } else if (customerId) {
    const list = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 1 });
    sub = list.data[0] ?? null;
  }

  if (!sub) {
    return { ok: false, reason: "No Stripe subscription found for this user." };
  }

  // Ensure our user_id is carried so resolveUserId maps correctly.
  if (!sub.metadata?.user_id) {
    sub.metadata = { ...sub.metadata, user_id: userId };
  }
  const result = await syncSubscription(admin, sub);
  if (!result) return { ok: false, reason: "Could not resolve the user for this subscription." };
  return { ok: true, tier: result.tier, status: result.status };
}
