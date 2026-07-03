// Subscription tier that drives AI model routing (W2): paid tiers get Claude,
// free stays on the NVIDIA Llama path. The tier→model mapping lives in
// lib/ai/provider.ts; this module only answers "what tier is this user on".
//
// Stripe billing + entitlements (L6/B1) is not built yet, so there is no
// subscriptions table to read. Until then the tier comes from an env default —
// which lets the founder exercise the paid Claude path pre-launch by setting
// AI_DEFAULT_TIER=pro. When L6 lands, replace resolveUserTier's body with a
// subscriptions lookup keyed on the user id (the signature already takes it).

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

// Resolve a user's AI tier. Currently env-driven (see module note); the
// `supabase`/`userId` params are accepted now so L6 can swap in the real
// subscriptions lookup without touching any caller.
export async function resolveUserTier(
  _supabase: SupabaseClient,
  _userId: string
): Promise<AiTier> {
  return envDefaultTier();
}
