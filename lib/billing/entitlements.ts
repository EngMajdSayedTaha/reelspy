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

// Which Claude model a tier's AI calls resolve to (see lib/ai/provider.ts).
// "haiku" only applies to the free tier's fallback path (paid tiers never see
// it) — Creator is Sonnet, Pro/Studio are Opus, per the founder's B3 decision
// to keep the Creator→Pro upsell tied to model quality, not just volume.
export type AiModel = "haiku" | "sonnet" | "opus";

export type Entitlements = {
  accounts: number;
  scripts_mo: number;
  transcripts_mo: number;
  automations: number;
  publish_targets: number;
  // How many IG source accounts a user can connect + switch between (X4). Only
  // Studio is multi-account; everyone else has a single connection.
  ig_connections: number;
  model: AiModel;
};

export const ENTITLEMENTS: Record<AiTier, Entitlements> = {
  free: { accounts: 3, scripts_mo: 10, transcripts_mo: 5, automations: 0, publish_targets: 0, ig_connections: 1, model: "haiku" },
  creator: { accounts: 30, scripts_mo: 60, transcripts_mo: 30, automations: 15, publish_targets: 1, ig_connections: 1, model: "sonnet" },
  pro: { accounts: 50, scripts_mo: 200, transcripts_mo: 100, automations: 30, publish_targets: 4, ig_connections: 1, model: "opus" },
  studio: { accounts: 100, scripts_mo: UNLIMITED, transcripts_mo: UNLIMITED, automations: 60, publish_targets: 4, ig_connections: 5, model: "opus" },
  // Fail-open fallback for a "custom" subscription whose per-user config isn't
  // available yet (e.g. the few seconds between checkout completing and the
  // Stripe webhook writing subscriptions.custom_entitlements). Deliberately set
  // at Creator level rather than Free — the user already paid, so under-serving
  // them at Free-tier caps would be a worse failure mode than briefly over- or
  // under-shooting their actual custom config. lib/billing/resolve.ts is the
  // real source of truth for a signed-in custom user; this is only the gap-fill.
  custom: { accounts: 30, scripts_mo: 60, transcripts_mo: 30, automations: 15, publish_targets: 1, ig_connections: 1, model: "sonnet" },
};

export type EntitlementKey = keyof Omit<Entitlements, "model">;

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

// Same as limitFor/withinLimit but against an already-resolved Entitlements
// object (custom-plan aware — see lib/billing/resolve.ts) instead of a bare
// tier, which can't carry a custom subscriber's per-user limits on its own.
export function limitOf(ent: Entitlements, key: EntitlementKey): number {
  return ent[key];
}

export function withinLimitOf(ent: Entitlements, key: EntitlementKey, used: number): boolean {
  const limit = ent[key];
  return isUnlimited(limit) || used < limit;
}

// A human-friendly cap string for UI/error copy ("10", "Unlimited").
export function formatLimit(limit: number): string {
  return isUnlimited(limit) ? "Unlimited" : String(limit);
}

// Validates + narrows an unknown value (parsed JSON from a DB jsonb column or
// Stripe metadata string) into a real Entitlements object. Returns null on any
// shape mismatch so callers can fall back to ENTITLEMENTS.custom rather than
// trust unvalidated data — this is the boundary where Stripe metadata (opaque
// to TypeScript) becomes a typed value.
export function coerceEntitlements(value: unknown): Entitlements | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const numKeys: EntitlementKey[] = [
    "accounts",
    "scripts_mo",
    "transcripts_mo",
    "automations",
    "publish_targets",
    "ig_connections",
  ];
  for (const key of numKeys) {
    if (typeof v[key] !== "number" || !Number.isFinite(v[key])) return null;
  }
  if (v.model !== "haiku" && v.model !== "sonnet" && v.model !== "opus") return null;
  return {
    accounts: v.accounts as number,
    scripts_mo: v.scripts_mo as number,
    transcripts_mo: v.transcripts_mo as number,
    automations: v.automations as number,
    publish_targets: v.publish_targets as number,
    ig_connections: v.ig_connections as number,
    model: v.model,
  };
}
