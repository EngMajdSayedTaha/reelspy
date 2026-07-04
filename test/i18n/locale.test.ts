import { describe, it, expect } from "vitest";
import {
  LOCALES,
  DEFAULT_LOCALE,
  dirForLocale,
  isLocale,
  normalizeLocale,
} from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { parsePrefs, serializePrefs, DEFAULT_PREFS } from "@/lib/prefs";

describe("locale config", () => {
  it("maps ar→rtl and everything else→ltr", () => {
    expect(dirForLocale("ar")).toBe("rtl");
    expect(dirForLocale("en")).toBe("ltr");
  });

  it("normalizes unknown/garbage locales to the default", () => {
    expect(normalizeLocale("ar")).toBe("ar");
    expect(normalizeLocale("fr")).toBe(DEFAULT_LOCALE);
    expect(normalizeLocale(undefined)).toBe(DEFAULT_LOCALE);
    expect(normalizeLocale(42)).toBe(DEFAULT_LOCALE);
  });

  it("isLocale guards to the supported set", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("ar")).toBe(true);
    expect(isLocale("de")).toBe(false);
  });
});

describe("dictionaries", () => {
  // Every locale must expose the exact same key shape as English, else a lookup
  // silently renders undefined. Recursively compare key sets.
  function keyShape(obj: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = v && typeof v === "object" ? keyShape(v as Record<string, unknown>) : true;
    }
    return out;
  }

  it("all locales share the English key shape with non-empty strings", () => {
    const en = getDictionary("en") as unknown as Record<string, unknown>;
    const enShape = keyShape(en);
    for (const locale of LOCALES) {
      const dict = getDictionary(locale) as unknown as Record<string, unknown>;
      expect(keyShape(dict)).toEqual(enShape);
      // spot-check a couple of leaves are actually translated (non-empty)
      const nav = (dict.nav ?? {}) as Record<string, string>;
      for (const label of Object.values(nav)) {
        expect(label.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("prefs locale", () => {
  it("defaults locale when the cookie omits it", () => {
    expect(parsePrefs(undefined).locale).toBe(DEFAULT_LOCALE);
    expect(parsePrefs(encodeURIComponent(JSON.stringify({ toastMs: 3000 }))).locale).toBe(
      DEFAULT_LOCALE
    );
  });

  it("round-trips a valid locale and rejects an invalid one", () => {
    const withAr = serializePrefs({ ...DEFAULT_PREFS, locale: "ar" });
    expect(parsePrefs(withAr).locale).toBe("ar");
    const bogus = encodeURIComponent(JSON.stringify({ ...DEFAULT_PREFS, locale: "zz" }));
    expect(parsePrefs(bogus).locale).toBe(DEFAULT_LOCALE);
  });
});
