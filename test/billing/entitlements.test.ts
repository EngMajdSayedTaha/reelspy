import { describe, it, expect } from "vitest";
import {
  ENTITLEMENTS,
  UNLIMITED,
  entitlementsFor,
  limitFor,
  limitOf,
  withinLimitOf,
  isUnlimited,
  withinLimit,
  formatLimit,
  coerceEntitlements,
} from "@/lib/billing/entitlements";
import type { AiTier } from "@/lib/ai/tier";

const TIERS: AiTier[] = ["free", "creator", "pro", "studio", "custom"];

describe("entitlements — tier caps (money logic)", () => {
  it("defines every tier with a full entitlement shape", () => {
    for (const tier of TIERS) {
      const e = ENTITLEMENTS[tier];
      expect(e).toBeDefined();
      for (const key of ["accounts", "scripts_mo", "transcripts_mo", "automations", "publish_targets"] as const) {
        expect(typeof e[key]).toBe("number");
      }
    }
  });

  it("locks in the founder-set caps that gate paid features", () => {
    expect(ENTITLEMENTS.free).toMatchObject({ accounts: 3, scripts_mo: 10, automations: 0, model: "haiku" });
    expect(ENTITLEMENTS.creator).toMatchObject({ accounts: 30, scripts_mo: 60, automations: 15, model: "sonnet" });
    expect(ENTITLEMENTS.pro).toMatchObject({ accounts: 50, scripts_mo: 200, automations: 30, model: "opus" });
    expect(ENTITLEMENTS.studio).toMatchObject({ accounts: 100, automations: 60, model: "opus" });
    expect(ENTITLEMENTS.studio.scripts_mo).toBe(UNLIMITED);
    expect(ENTITLEMENTS.studio.transcripts_mo).toBe(UNLIMITED);
  });

  it("free tier cannot create automations (paywall floor)", () => {
    expect(withinLimit("free", "automations", 0)).toBe(false);
  });

  it("caps rise monotonically across paid tiers for account slots", () => {
    expect(ENTITLEMENTS.creator.accounts).toBeGreaterThan(ENTITLEMENTS.free.accounts);
    expect(ENTITLEMENTS.pro.accounts).toBeGreaterThan(ENTITLEMENTS.creator.accounts);
    expect(ENTITLEMENTS.studio.accounts).toBeGreaterThan(ENTITLEMENTS.pro.accounts);
  });

  it("gives Creator Sonnet and Pro/Studio Opus (the model-tier upsell ladder)", () => {
    expect(ENTITLEMENTS.creator.model).toBe("sonnet");
    expect(ENTITLEMENTS.pro.model).toBe("opus");
    expect(ENTITLEMENTS.studio.model).toBe("opus");
  });
});

describe("entitlementsFor / limitFor", () => {
  it("returns the tier's entitlements", () => {
    expect(entitlementsFor("pro")).toBe(ENTITLEMENTS.pro);
    expect(limitFor("creator", "scripts_mo")).toBe(60);
  });

  it("falls back to free for an unknown tier", () => {
    expect(entitlementsFor("enterprise" as AiTier)).toBe(ENTITLEMENTS.free);
    expect(limitFor("garbage" as AiTier, "accounts")).toBe(ENTITLEMENTS.free.accounts);
  });
});

describe("isUnlimited", () => {
  it("treats any negative sentinel as unlimited", () => {
    expect(isUnlimited(UNLIMITED)).toBe(true);
    expect(isUnlimited(-1)).toBe(true);
    expect(isUnlimited(0)).toBe(false);
    expect(isUnlimited(10)).toBe(false);
  });
});

describe("withinLimit — the count-based chokepoint check", () => {
  it("allows consumption strictly below the cap", () => {
    expect(withinLimit("free", "accounts", 0)).toBe(true);
    expect(withinLimit("free", "accounts", 2)).toBe(true);
  });

  it("blocks at and beyond the cap", () => {
    expect(withinLimit("free", "accounts", 3)).toBe(false);
    expect(withinLimit("free", "accounts", 4)).toBe(false);
  });

  it("never blocks an unlimited entitlement", () => {
    expect(withinLimit("studio", "scripts_mo", 0)).toBe(true);
    expect(withinLimit("studio", "scripts_mo", 999_999)).toBe(true);
  });
});

describe("formatLimit — UI copy", () => {
  it("renders unlimited as a word, finite as the number", () => {
    expect(formatLimit(UNLIMITED)).toBe("Unlimited");
    expect(formatLimit(-5)).toBe("Unlimited");
    expect(formatLimit(0)).toBe("0");
    expect(formatLimit(60)).toBe("60");
  });
});

describe("limitOf / withinLimitOf — resolved-entitlements chokepoint check (B4)", () => {
  it("reads straight off an Entitlements object instead of a tier lookup", () => {
    const custom = { ...ENTITLEMENTS.free, accounts: 42, model: "opus" as const };
    expect(limitOf(custom, "accounts")).toBe(42);
    expect(withinLimitOf(custom, "accounts", 41)).toBe(true);
    expect(withinLimitOf(custom, "accounts", 42)).toBe(false);
  });

  it("never blocks an unlimited entitlement", () => {
    expect(withinLimitOf(ENTITLEMENTS.studio, "scripts_mo", 999_999)).toBe(true);
  });
});

describe("coerceEntitlements — Stripe metadata / DB jsonb boundary", () => {
  it("accepts a well-formed entitlements object", () => {
    const raw = {
      accounts: 42,
      scripts_mo: 77,
      transcripts_mo: 38,
      automations: 20,
      publish_targets: 3,
      ig_connections: 1,
      model: "opus",
    };
    expect(coerceEntitlements(raw)).toEqual(raw);
  });

  it("rejects missing/wrong-typed fields rather than guessing", () => {
    expect(coerceEntitlements(null)).toBeNull();
    expect(coerceEntitlements(undefined)).toBeNull();
    expect(coerceEntitlements("not an object")).toBeNull();
    expect(coerceEntitlements({ accounts: "42" })).toBeNull();
    expect(
      coerceEntitlements({
        accounts: 1,
        scripts_mo: 1,
        transcripts_mo: 1,
        automations: 1,
        publish_targets: 1,
        ig_connections: 1,
        model: "gpt-5",
      })
    ).toBeNull();
  });
});
