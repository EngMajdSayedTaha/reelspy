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

// "custom" is a dynamically-configured plan (B4): a user picks their own
// account/script/auto-reply/publish-target limits and AI model on the billing
// page, Stripe charges an ad-hoc price for that config, and the actual limits
// + model live on the subscription row (lib/billing/entitlements.ts
// ENTITLEMENTS.custom is only the fail-open fallback used before that data is
// available, e.g. the few seconds before the webhook lands).
// The tiers this build ships with. They remain the fallback catalog and the keys
// of the hardcoded ENTITLEMENTS table, but they are no longer the whole list:
// an admin can create a plan with any slug (lib/billing/catalog.ts).
export type BuiltinTier = "free" | "creator" | "pro" | "studio" | "custom";

export const BUILTIN_TIERS: readonly BuiltinTier[] = ["free", "creator", "pro", "studio", "custom"];

// `(string & {})` keeps autocomplete on the built-ins while still accepting an
// admin-created slug. Widening this — rather than adding a cast at every
// boundary — is what lets a new plan flow through checkout, the webhook, the
// subscriptions row and the billing page without special-casing.
export type AiTier = BuiltinTier | (string & {});

export function isBuiltinTier(value: string | null | undefined): value is BuiltinTier {
  return Boolean(value) && (BUILTIN_TIERS as readonly string[]).includes(value as string);
}

// A plan slug's SHAPE, not its existence. Read paths (what tier is this row on?
// what tier does this schedule phase name?) use this and fail open, because a
// slug this deployment's catalog hasn't loaded is still the customer's real
// plan. Write paths — checkout, admin — must additionally confirm the plan
// exists and is sellable against the catalog, and fail closed.
const SLUG_RE = /^[a-z][a-z0-9_-]{1,31}$/;

export function isAiTier(value: string | null | undefined): value is AiTier {
  return typeof value === "string" && SLUG_RE.test(value);
}

// The env fallback used until entitlements exist. Defaults to "free".
// Deliberately restricted to the BUILT-IN tiers rather than any well-formed
// slug. This is a deploy-time knob for exercising the paid path before launch,
// not a way to name an admin-created plan — and accepting anything shaped like a
// slug would turn a typo into a tier nobody notices.
function envDefaultTier(): AiTier {
  const raw = process.env.AI_DEFAULT_TIER?.trim().toLowerCase();
  return isBuiltinTier(raw) ? raw : "free";
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
  if (await isAdminUser(supabase, userId)) {
    // Which plan that is comes from the catalog (plans.admin_grant), not a
    // hardcoded slug — otherwise renaming or archiving Studio would silently
    // drop every admin to a mid plan, and to a cheaper AI model with it.
    const { loadCatalog } = await import("@/lib/billing/catalog");
    return (await loadCatalog()).adminSlug;
  }

  const { activeTierFromSubscription } = await import("@/lib/billing/subscription");
  const subTier = await activeTierFromSubscription(supabase, userId);
  return subTier ?? envDefaultTier();
}
