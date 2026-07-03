// Feature entitlements per subscription tier (L6 / B1) — the single source of
// truth for "what can this tier do". Enforced at four natural chokepoints:
//   - accounts        → app/dashboard/accounts/actions.ts (add / bulk add)
//   - scripts_mo      → app/api/generate-script/route.ts (monthly quota RPC)
//   - transcripts_mo  → transcript + reel-from-link routes (monthly quota RPC)
//   - automations     → app/dashboard/automations/actions.ts (create)
// publish_targets is advisory metadata for the billing page today (the publisher
// gates on connected accounts, not a hard count) — kept here so all tier limits
// live in one place.
//
// A limit of UNLIMITED (-1) means no cap. Numbers are a founder call; the shape
// is what the enforcement code depends on.

import type { AiTier } from "@/lib/ai/tier";

export const UNLIMITED = -1;

export type Entitlements = {
  accounts: number;
  scripts_mo: number;
  transcripts_mo: number;
  automations: number;
  publish_targets: number;
};

export const ENTITLEMENTS: Record<AiTier, Entitlements> = {
  free: { accounts: 3, scripts_mo: 10, transcripts_mo: 5, automations: 0, publish_targets: 0 },
  creator: { accounts: 10, scripts_mo: 60, transcripts_mo: 30, automations: 3, publish_targets: 1 },
  pro: { accounts: 25, scripts_mo: 200, transcripts_mo: 100, automations: 10, publish_targets: 4 },
  studio: { accounts: 50, scripts_mo: UNLIMITED, transcripts_mo: UNLIMITED, automations: 30, publish_targets: 4 },
};

export type EntitlementKey = keyof Entitlements;

export function entitlementsFor(tier: AiTier): Entitlements {
  return ENTITLEMENTS[tier] ?? ENTITLEMENTS.free;
}

export function limitFor(tier: AiTier, key: EntitlementKey): number {
  return entitlementsFor(tier)[key];
}

export function isUnlimited(limit: number): boolean {
  return limit < 0;
}

// True when a caller currently holding `used` of `key` may consume one more.
// Used for the count-based chokepoints (accounts, automations) where we already
// know the current total; the monthly-quota chokepoints use the RPC instead.
export function withinLimit(tier: AiTier, key: EntitlementKey, used: number): boolean {
  const limit = limitFor(tier, key);
  return isUnlimited(limit) || used < limit;
}

// A human-friendly cap string for UI/error copy ("10", "Unlimited").
export function formatLimit(limit: number): string {
  return isUnlimited(limit) ? "Unlimited" : String(limit);
}
