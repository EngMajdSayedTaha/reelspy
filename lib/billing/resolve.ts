// Resolves a signed-in user's tier AND effective entitlements in one call,
// custom-plan aware (B4). Every fixed tier's entitlements come straight from
// ENTITLEMENTS; a "custom" subscriber's come from their own subscription row
// instead, since ENTITLEMENTS.custom is only the fail-open placeholder — see
// lib/billing/entitlements.ts. Enforcement chokepoints (accounts, automations,
// monthly quotas) should call this instead of resolveUserTier() + entitlementsFor()
// whenever they need the actual numbers a custom subscriber configured.

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveUserTier, type AiTier } from "@/lib/ai/tier";
import { entitlementsFor, ENTITLEMENTS, type Entitlements } from "@/lib/billing/entitlements";
import { getSubscription } from "@/lib/billing/subscription";

export async function resolveUserEntitlements(
  supabase: SupabaseClient,
  userId: string
): Promise<{ tier: AiTier; entitlements: Entitlements }> {
  const tier = await resolveUserTier(supabase, userId);
  if (tier !== "custom") {
    return { tier, entitlements: entitlementsFor(tier) };
  }
  const sub = await getSubscription(supabase, userId);
  return { tier, entitlements: sub?.customEntitlements ?? ENTITLEMENTS.custom };
}
