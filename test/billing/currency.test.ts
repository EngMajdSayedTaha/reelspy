import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  currencyForCountry,
  normalizeCurrency,
  isCurrency,
  formatPrice,
  DEFAULT_CURRENCY,
} from "@/lib/billing/currency";

// The rule worth protecting: an existing subscriber's currency NEVER changes.
// Stripe locks a subscription's currency for its lifetime, so quoting them
// anything else is quoting a price we couldn't charge.

const cookieStore = new Map<string, string>();
const headerStore = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (k: string) => (cookieStore.has(k) ? { value: cookieStore.get(k) } : undefined) }),
  headers: async () => ({ get: (k: string) => headerStore.get(k) ?? null }),
}));

const { resolveDisplayCurrency } = await import("@/lib/billing/currency-server");

beforeEach(() => {
  cookieStore.clear();
  headerStore.clear();
});

describe("currencyForCountry", () => {
  it("prices the Gulf in local currency and everyone else in dollars", () => {
    expect(currencyForCountry("AE")).toBe("aed");
    expect(currencyForCountry("SA")).toBe("sar");
    expect(currencyForCountry("GB")).toBe("usd");
    expect(currencyForCountry("EG")).toBe("usd");
  });

  it("is tolerant of case and whitespace, and of no country at all", () => {
    expect(currencyForCountry(" ae ")).toBe("aed");
    expect(currencyForCountry(null)).toBe("usd");
    expect(currencyForCountry(undefined)).toBe("usd");
  });
});

describe("normalizeCurrency", () => {
  it("accepts the supported codes in any case", () => {
    expect(normalizeCurrency("AED")).toBe("aed");
    expect(normalizeCurrency(" sar ")).toBe("sar");
  });

  it("rejects anything else rather than guessing", () => {
    expect(normalizeCurrency("gbp")).toBeNull();
    expect(normalizeCurrency("")).toBeNull();
    expect(normalizeCurrency(42)).toBeNull();
    expect(normalizeCurrency(null)).toBeNull();
    expect(isCurrency("eur")).toBe(false);
  });
});

describe("resolveDisplayCurrency", () => {
  // The whole point. A subscriber who travels, or whose cookie says otherwise,
  // still sees the currency they are actually billed in.
  it("lets an existing subscription override the cookie and the country", async () => {
    cookieStore.set("reelspy_currency", "usd");
    headerStore.set("x-vercel-ip-country", "GB");

    expect(await resolveDisplayCurrency("aed")).toEqual({ currency: "aed", locked: true });
  });

  it("uses an explicit choice ahead of the visitor's country", async () => {
    cookieStore.set("reelspy_currency", "sar");
    headerStore.set("x-vercel-ip-country", "GB");

    expect(await resolveDisplayCurrency(null)).toEqual({ currency: "sar", locked: false });
  });

  it("falls back to the country when nothing has been chosen", async () => {
    headerStore.set("x-vercel-ip-country", "SA");
    expect(await resolveDisplayCurrency(null)).toEqual({ currency: "sar", locked: false });
  });

  // Local dev, CI and self-hosted previews have no geo header. Defaulting to AED
  // there means the app behaves exactly as it did before multi-currency existed.
  it("defaults to AED with no cookie and no geo header", async () => {
    expect(await resolveDisplayCurrency(null)).toEqual({ currency: DEFAULT_CURRENCY, locked: false });
    expect(DEFAULT_CURRENCY).toBe("aed");
  });

  it("ignores a garbage subscription currency rather than locking to nonsense", async () => {
    headerStore.set("x-vercel-ip-country", "AE");
    expect(await resolveDisplayCurrency("bitcoin")).toEqual({ currency: "aed", locked: false });
  });
});

describe("formatPrice", () => {
  it("renders minor units as a localised price", () => {
    expect(formatPrice(14900, "aed", "en")).toContain("149");
    expect(formatPrice(3900, "usd", "en")).toContain("39");
  });

  // Plan prices are whole numbers; "AED 149.00" reads like a receipt.
  it("drops trailing .00 but keeps real decimals", () => {
    expect(formatPrice(14900, "usd", "en")).not.toContain(".00");
    expect(formatPrice(14950, "usd", "en")).toContain(".5");
  });

  it("never throws on an unexpected locale", () => {
    expect(formatPrice(14900, "aed", "not-a-locale")).toContain("149");
  });
});
