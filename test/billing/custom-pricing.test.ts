import { describe, it, expect } from "vitest";
import {
  CUSTOM_PLAN_RANGE,
  DEFAULT_CUSTOM_CONFIG,
  DEFAULT_CUSTOM_RATES,
  coerceCustomRates,
  clampCustomConfig,
  computeCustomEntitlements,
  computeCustomPriceAed,
  type CustomPlanConfig,
} from "@/lib/billing/custom-pricing";
import { UNLIMITED } from "@/lib/billing/entitlements";

// The fixed tiers' configs, expressed as CustomPlanConfig, for calibration
// checks against the real Creator/Pro/Studio prices (49/149/349 AED).
const CREATOR_EQUIVALENT: CustomPlanConfig = {
  accounts: 30,
  scriptsUnlimited: false,
  scripts: 60,
  automations: 15,
  publishTargets: 1,
  model: "sonnet",
};
const PRO_EQUIVALENT: CustomPlanConfig = {
  accounts: 50,
  scriptsUnlimited: false,
  scripts: 200,
  automations: 30,
  publishTargets: 4,
  model: "opus",
};
const STUDIO_EQUIVALENT: CustomPlanConfig = {
  accounts: 100,
  scriptsUnlimited: true,
  scripts: 0,
  automations: 60,
  publishTargets: 4,
  model: "opus",
};

describe("computeCustomPriceAed — calibration against the fixed tiers", () => {
  it("lands within 10% of Creator's 49 AED at the equivalent config", () => {
    const price = computeCustomPriceAed(CREATOR_EQUIVALENT);
    expect(price).toBeGreaterThanOrEqual(49 * 0.9);
    expect(price).toBeLessThanOrEqual(49 * 1.1);
  });

  it("lands within 10% of Pro's 149 AED at the equivalent config", () => {
    const price = computeCustomPriceAed(PRO_EQUIVALENT);
    expect(price).toBeGreaterThanOrEqual(149 * 0.9);
    expect(price).toBeLessThanOrEqual(149 * 1.1);
  });

  it("lands within 10% of Studio's 349 AED at the equivalent config", () => {
    const price = computeCustomPriceAed(STUDIO_EQUIVALENT);
    expect(price).toBeGreaterThanOrEqual(349 * 0.9);
    expect(price).toBeLessThanOrEqual(349 * 1.1);
  });

  it("charges more for Opus than an otherwise-identical Sonnet config", () => {
    const sonnet = computeCustomPriceAed({ ...PRO_EQUIVALENT, model: "sonnet" });
    const opus = computeCustomPriceAed({ ...PRO_EQUIVALENT, model: "opus" });
    expect(opus).toBeGreaterThan(sonnet);
  });

  it("rises monotonically with every slider", () => {
    const base = computeCustomPriceAed(DEFAULT_CUSTOM_CONFIG);
    expect(computeCustomPriceAed({ ...DEFAULT_CUSTOM_CONFIG, accounts: DEFAULT_CUSTOM_CONFIG.accounts + 50 })).toBeGreaterThan(base);
    expect(computeCustomPriceAed({ ...DEFAULT_CUSTOM_CONFIG, scripts: DEFAULT_CUSTOM_CONFIG.scripts + 100 })).toBeGreaterThan(base);
    expect(computeCustomPriceAed({ ...DEFAULT_CUSTOM_CONFIG, automations: DEFAULT_CUSTOM_CONFIG.automations + 50 })).toBeGreaterThan(base);
    expect(computeCustomPriceAed({ ...DEFAULT_CUSTOM_CONFIG, publishTargets: DEFAULT_CUSTOM_CONFIG.publishTargets + 5 })).toBeGreaterThan(base);
  });

  it("never prices below the floor even at the smallest config", () => {
    const price = computeCustomPriceAed({
      accounts: CUSTOM_PLAN_RANGE.accounts.min,
      scriptsUnlimited: false,
      scripts: CUSTOM_PLAN_RANGE.scripts.min,
      automations: CUSTOM_PLAN_RANGE.automations.min,
      publishTargets: CUSTOM_PLAN_RANGE.publishTargets.min,
      model: "sonnet",
    });
    expect(price).toBeGreaterThanOrEqual(19);
  });
});

describe("computeCustomEntitlements", () => {
  it("maps sliders 1:1 onto accounts/automations/publish_targets/model", () => {
    const ent = computeCustomEntitlements(PRO_EQUIVALENT);
    expect(ent.accounts).toBe(50);
    expect(ent.automations).toBe(30);
    expect(ent.publish_targets).toBe(4);
    expect(ent.model).toBe("opus");
  });

  it("sets scripts_mo/transcripts_mo to UNLIMITED when the toggle is on", () => {
    const ent = computeCustomEntitlements(STUDIO_EQUIVALENT);
    expect(ent.scripts_mo).toBe(UNLIMITED);
    expect(ent.transcripts_mo).toBe(UNLIMITED);
  });

  it("derives transcripts_mo as roughly half of scripts_mo, mirroring the fixed tiers", () => {
    const ent = computeCustomEntitlements(PRO_EQUIVALENT);
    expect(ent.transcripts_mo).toBe(100);
  });

  it("grants multi-account IG connections only at higher account counts", () => {
    expect(computeCustomEntitlements(CREATOR_EQUIVALENT).ig_connections).toBe(1);
    expect(computeCustomEntitlements(STUDIO_EQUIVALENT).ig_connections).toBe(5);
  });
});

describe("clampCustomConfig — defense in depth against a tampered request", () => {
  it("clamps out-of-range values into the valid slider bounds", () => {
    const clamped = clampCustomConfig({
      accounts: 999_999,
      scriptsUnlimited: false,
      scripts: -50,
      automations: 999,
      publishTargets: 999,
      model: "opus",
    });
    expect(clamped.accounts).toBe(CUSTOM_PLAN_RANGE.accounts.max);
    expect(clamped.scripts).toBe(CUSTOM_PLAN_RANGE.scripts.min);
    expect(clamped.automations).toBe(CUSTOM_PLAN_RANGE.automations.max);
    expect(clamped.publishTargets).toBe(CUSTOM_PLAN_RANGE.publishTargets.max);
  });

  it("normalizes an invalid model to sonnet rather than erroring", () => {
    // @ts-expect-error deliberately passing a bogus model
    expect(clampCustomConfig({ ...DEFAULT_CUSTOM_CONFIG, model: "gpt-5" }).model).toBe("sonnet");
  });
});

// The rate card is admin-editable now, so the maths has to work with injected
// rates — and has to refuse a rate card that would undercut the fixed tiers.
describe("admin-editable rate card", () => {
  it("prices from injected rates rather than the shipped constants", () => {
    const doubled = {
      ...DEFAULT_CUSTOM_RATES,
      perAccount: DEFAULT_CUSTOM_RATES.perAccount * 2,
    };
    expect(computeCustomPriceAed(DEFAULT_CUSTOM_CONFIG, doubled)).toBeGreaterThan(
      computeCustomPriceAed(DEFAULT_CUSTOM_CONFIG, DEFAULT_CUSTOM_RATES)
    );
  });

  it("falls back to the shipped rates when none are given", () => {
    expect(computeCustomPriceAed(DEFAULT_CUSTOM_CONFIG)).toBe(
      computeCustomPriceAed(DEFAULT_CUSTOM_CONFIG, DEFAULT_CUSTOM_RATES)
    );
  });

  it("repairs a malformed rate card field by field instead of producing NaN", () => {
    const rates = coerceCustomRates({ perAccount: "lots", base: 20, minPrice: null });
    expect(rates.perAccount).toBe(DEFAULT_CUSTOM_RATES.perAccount);
    expect(rates.base).toBe(20);
    expect(rates.minPrice).toBe(DEFAULT_CUSTOM_RATES.minPrice);
    expect(Number.isFinite(computeCustomPriceAed(DEFAULT_CUSTOM_CONFIG, rates))).toBe(true);
  });

  it("refuses a multiplier below 1, which would undercut the fixed tiers", () => {
    // The premium exists so a bespoke config is never a cheaper route to the
    // same specs; a sub-1 multiplier would invert exactly that.
    expect(coerceCustomRates({ buildYourOwnMultiplier: 0.5 }).buildYourOwnMultiplier).toBe(1);
  });

  it("treats junk as an entirely default rate card", () => {
    expect(coerceCustomRates(null)).toEqual(DEFAULT_CUSTOM_RATES);
    expect(coerceCustomRates("nope")).toEqual(DEFAULT_CUSTOM_RATES);
  });
});
