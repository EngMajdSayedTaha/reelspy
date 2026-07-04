import { describe, it, expect } from "vitest";
import {
  buildScriptSystemPrompt,
  isArabicDialect,
  ARABIC_DIALECTS,
  type BrandVoice,
} from "@/lib/ai/claude";

describe("isArabicDialect", () => {
  it("accepts only the known dialects", () => {
    expect(isArabicDialect("gulf")).toBe(true);
    expect(isArabicDialect("msa")).toBe(true);
    expect(isArabicDialect("egyptian")).toBe(false);
    expect(isArabicDialect("")).toBe(false);
    expect(isArabicDialect(null)).toBe(false);
    expect(isArabicDialect(undefined)).toBe(false);
  });

  it("exposes both presets with EN + AR labels", () => {
    expect(ARABIC_DIALECTS.map((d) => d.value)).toEqual(["gulf", "msa"]);
    for (const d of ARABIC_DIALECTS) {
      expect(d.labelEn.length).toBeGreaterThan(0);
      expect(d.labelAr.length).toBeGreaterThan(0);
    }
  });
});

describe("buildScriptSystemPrompt Arabic preset", () => {
  const base: BrandVoice = { niche: "fitness", audience: "gym-goers" };

  it("omits the language requirement when no dialect is set", () => {
    const prompt = buildScriptSystemPrompt(base);
    expect(prompt).not.toContain("LANGUAGE REQUIREMENT");
  });

  it("injects a Gulf/Khaleeji directive", () => {
    const prompt = buildScriptSystemPrompt({ ...base, arabicDialect: "gulf" });
    expect(prompt).toContain("LANGUAGE REQUIREMENT");
    expect(prompt).toContain("Khaleeji");
    expect(prompt).toContain("in Arabic");
    // Gulf must explicitly steer away from MSA.
    expect(prompt).toContain("Do NOT use formal Modern Standard Arabic");
  });

  it("injects an MSA directive", () => {
    const prompt = buildScriptSystemPrompt({ ...base, arabicDialect: "msa" });
    expect(prompt).toContain("LANGUAGE REQUIREMENT");
    expect(prompt).toContain("Modern Standard Arabic");
    expect(prompt).toContain("الفصحى");
  });

  it("ignores an unrecognized dialect value", () => {
    // A bad value shouldn't force Arabic (the action also guards, but defense in depth).
    const prompt = buildScriptSystemPrompt({
      ...base,
      arabicDialect: "klingon" as unknown as BrandVoice["arabicDialect"],
    });
    expect(prompt).not.toContain("LANGUAGE REQUIREMENT");
  });
});
