// Resolves a signed-in user's tier AND effective entitlements in one call.
//
// This is THE function every enforcement chokepoint goes through (accounts,
// automations, monthly script/transcript quotas, IG connections), which is why
// it is the only place that had to learn about the admin-managed plan catalog:
// the chokepoints themselves are unchanged.
//
// Two sources, in order of specificity:
//   - a "custom" (build-your-own) subscriber's limits live on their own
//     subscription row, since no shared plan can describe them;
//   - everyone else gets their plan's limits from the catalog, which falls back
//     to the hardcoded ENTITLEMENTS table when the database has nothing to say.

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveUserTier, type AiTier } from "@/lib/ai/tier";
import { ENTITLEMENTS, type Entitlements } from "@/lib/billing/entitlements";
import { getSubscription } from "@/lib/billing/subscription";
import { loadCatalog, entitlementsForSlug } from "@/lib/billing/catalog";

export async function resolveUserEntitlements(
  supabase: SupabaseClient,
  userId: string
): Promise<{ tier: AiTier; entitlements: Entitlements }> {
  const tier = await resolveUserTier(supabase, userId);
  if (tier !== "custom") {
    const catalog = await loadCatalog();
    return { tier, entitlements: entitlementsForSlug(catalog, tier) };
  }
  // ENTITLEMENTS.custom is only the gap-filler for the seconds between checkout
  // completing and the Stripe webhook writing the real config onto the row.
  const sub = await getSubscription(supabase, userId);
  return { tier, entitlements: sub?.customEntitlements ?? ENTITLEMENTS.custom };
}
