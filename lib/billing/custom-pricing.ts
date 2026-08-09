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

// The rate card. Editable by an admin (stored on the custom plan's row and
// passed in), because it is CALIBRATED to the fixed tiers' prices — the moment
// someone changes what Creator costs without touching these, a custom plan at
// Creator-equivalent settings drifts away from it, and can end up cheaper.
export type CustomRates = {
  base: number;
  perAccount: number;
  perScript: number;
  perAutomation: number;
  perPublishTarget: number;
  opusPremium: number;
  unlimitedScriptsFee: number;
  /** So a bespoke config is never a cheaper route to the same specs. */
  buildYourOwnMultiplier: number;
  minPrice: number;
};

// What this build shipped with — the fail-open default whenever the catalog has
// nothing to say, and the numbers the calibration tests assert against.
export const DEFAULT_CUSTOM_RATES: CustomRates = {
  base: 9,
  perAccount: 0.4,
  perScript: 0.15,
  perAutomation: 0.6,
  perPublishTarget: 6,
  opusPremium: 35,
  unlimitedScriptsFee: 180,
  buildYourOwnMultiplier: 1.08,
  minPrice: 19,
};

// Narrow an admin-edited jsonb blob to a usable rate card. Any missing or
// non-finite field falls back to the shipped default rather than poisoning the
// price with a NaN — a broken rate card must never produce a broken charge.
export function coerceCustomRates(value: unknown): CustomRates {
  if (!value || typeof value !== "object") return DEFAULT_CUSTOM_RATES;
  const v = value as Record<string, unknown>;
  const num = (key: keyof CustomRates): number => {
    const raw = v[key];
    return typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_CUSTOM_RATES[key];
  };
  return {
    base: num("base"),
    perAccount: num("perAccount"),
    perScript: num("perScript"),
    perAutomation: num("perAutomation"),
    perPublishTarget: num("perPublishTarget"),
    opusPremium: num("opusPremium"),
    unlimitedScriptsFee: num("unlimitedScriptsFee"),
    // A multiplier below 1 would make bespoke configs CHEAPER than the fixed
    // tiers, which is the one thing the premium exists to prevent.
    buildYourOwnMultiplier: Math.max(1, num("buildYourOwnMultiplier")),
    minPrice: num("minPrice"),
  };
}

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

export function computeCustomPriceAed(
  config: CustomPlanConfig,
  rates: CustomRates = DEFAULT_CUSTOM_RATES
): number {
  const scriptsCost = config.scriptsUnlimited
    ? rates.unlimitedScriptsFee
    : config.scripts * rates.perScript;
  const subtotal =
    rates.base +
    config.accounts * rates.perAccount +
    scriptsCost +
    config.automations * rates.perAutomation +
    config.publishTargets * rates.perPublishTarget +
    (config.model === "opus" ? rates.opusPremium : 0);
  return Math.max(rates.minPrice, Math.round(subtotal * rates.buildYourOwnMultiplier));
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
