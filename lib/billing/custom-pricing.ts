// Pricing + entitlement math for the dynamic "build your own plan" card (B4).
// Pure functions, no server-only imports — both the client slider (live price
// preview) and the checkout route (authoritative price; never trust a
// client-sent number) import from here, so they can never drift apart.
//
// The linear model below is a first pass calibrated to land close to the three
// fixed tiers' prices at their equivalent configs (Creator ~49, Pro ~149,
// Studio ~349 AED — see test/billing/custom-pricing.test.ts) plus a flat 8%
// "build-your-own" premium so a custom config is never a strictly cheaper way
// to buy the same specs as a fixed plan. Founder/finance should sanity-check
// these rates against real unit economics before launch — see the pricing
// review notes in docs/billing-setup.md.

import { UNLIMITED, type AiModel, type Entitlements } from "@/lib/billing/entitlements";

export type CustomPlanConfig = {
  accounts: number;
  scriptsUnlimited: boolean;
  scripts: number; // ignored when scriptsUnlimited is true
  automations: number;
  publishTargets: number;
  model: Extract<AiModel, "sonnet" | "opus">;
};

// Slider ranges shown on the billing page. Server-side validation clamps to
// these same bounds so a tampered request can't buy an out-of-range config.
export const CUSTOM_PLAN_RANGE = {
  accounts: { min: 5, max: 300, step: 5, default: 30 },
  scripts: { min: 10, max: 500, step: 10, default: 60 },
  automations: { min: 0, max: 200, step: 5, default: 15 },
  publishTargets: { min: 0, max: 10, step: 1, default: 1 },
} as const;

export const DEFAULT_CUSTOM_CONFIG: CustomPlanConfig = {
  accounts: CUSTOM_PLAN_RANGE.accounts.default,
  scriptsUnlimited: false,
  scripts: CUSTOM_PLAN_RANGE.scripts.default,
  automations: CUSTOM_PLAN_RANGE.automations.default,
  publishTargets: CUSTOM_PLAN_RANGE.publishTargets.default,
  model: "sonnet",
};

const BASE_AED = 9;
const RATE_PER_ACCOUNT = 0.4;
const RATE_PER_SCRIPT = 0.15;
const RATE_PER_AUTOMATION = 0.6;
const RATE_PER_PUBLISH_TARGET = 6;
const OPUS_PREMIUM_AED = 35;
const UNLIMITED_SCRIPTS_FEE_AED = 180;
const BUILD_YOUR_OWN_PREMIUM = 1.08;
const MIN_PRICE_AED = 19;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

// Clamps an arbitrary (possibly client-supplied) config to the valid slider
// ranges. Call this before pricing/entitling anything that came over the wire.
export function clampCustomConfig(config: CustomPlanConfig): CustomPlanConfig {
  const { accounts, scripts, automations, publishTargets } = CUSTOM_PLAN_RANGE;
  return {
    accounts: clamp(config.accounts, accounts.min, accounts.max),
    scriptsUnlimited: config.scriptsUnlimited === true,
    scripts: clamp(config.scripts, scripts.min, scripts.max),
    automations: clamp(config.automations, automations.min, automations.max),
    publishTargets: clamp(config.publishTargets, publishTargets.min, publishTargets.max),
    model: config.model === "opus" ? "opus" : "sonnet",
  };
}

export function computeCustomPriceAed(config: CustomPlanConfig): number {
  const scriptsCost = config.scriptsUnlimited
    ? UNLIMITED_SCRIPTS_FEE_AED
    : config.scripts * RATE_PER_SCRIPT;
  const subtotal =
    BASE_AED +
    config.accounts * RATE_PER_ACCOUNT +
    scriptsCost +
    config.automations * RATE_PER_AUTOMATION +
    config.publishTargets * RATE_PER_PUBLISH_TARGET +
    (config.model === "opus" ? OPUS_PREMIUM_AED : 0);
  return Math.max(MIN_PRICE_AED, Math.round(subtotal * BUILD_YOUR_OWN_PREMIUM));
}

// transcripts_mo and ig_connections aren't sliders — they're derived so the
// custom plan doesn't need a dozen knobs. Mirrors the ~0.5 scripts:transcripts
// ratio the fixed tiers use, and grants multi-account IG connections (X4) past
// the account count where Studio does.
export function computeCustomEntitlements(config: CustomPlanConfig): Entitlements {
  const scripts_mo = config.scriptsUnlimited ? UNLIMITED : config.scripts;
  const transcripts_mo = config.scriptsUnlimited ? UNLIMITED : Math.round(config.scripts / 2);
  return {
    accounts: config.accounts,
    scripts_mo,
    transcripts_mo,
    automations: config.automations,
    publish_targets: config.publishTargets,
    ig_connections: config.accounts >= 80 ? 5 : 1,
    model: config.model,
  };
}
