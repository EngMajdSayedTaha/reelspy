// Subscription tier that drives AI model routing (W2): paid tiers get Claude,
// free stays on the NVIDIA Llama path. The tier→model mapping lives in
// lib/ai/provider.ts; this module only answers "what tier is this user on".
//
// Tier now comes from the Stripe-written `subscriptions` table (L6/B1) via
// lib/billing/subscription.ts. When a user has no ACTIVE subscription we fall
// back to AI_DEFAULT_TIER — which stays "free" in prod but lets the founder
// exercise the paid Claude path pre-launch (or before their first checkout) by
// setting AI_DEFAULT_TIER=pro. The subscription lookup fails open, so a missing
// table / DB blip degrades to that env default rather than breaking generation.

import type { SupabaseClient } from "@supabase/supabase-js";

export type AiTier = "free" | "creator" | "pro" | "studio";

const VALID_TIERS: readonly AiTier[] = ["free", "creator", "pro", "studio"];

export function isAiTier(value: string | null | undefined): value is AiTier {
  return Boolean(value) && (VALID_TIERS as readonly string[]).includes(value as string);
}

// The env fallback used until entitlements exist. Defaults to "free".
function envDefaultTier(): AiTier {
  const raw = process.env.AI_DEFAULT_TIER?.trim().toLowerCase();
  return isAiTier(raw) ? (raw as AiTier) : "free";
}

// Resolve a user's AI tier: an admin (profiles.is_admin) always resolves to the
// top tier regardless of billing state; otherwise an ACTIVE Stripe subscription
// wins; otherwise the env default (free in prod). Imports are lazy to avoid a
// module cycle (billing/subscription.ts → ai/tier.ts for the AiTier type).
export async function resolveUserTier(
  supabase: SupabaseClient,
  userId: string
): Promise<AiTier> {
  const { isAdminUser } = await import("@/lib/billing/admin");
  if (await isAdminUser(supabase, userId)) return "studio";

  const { activeTierFromSubscription } = await import("@/lib/billing/subscription");
  const subTier = await activeTierFromSubscription(supabase, userId);
  return subTier ?? envDefaultTier();
}
