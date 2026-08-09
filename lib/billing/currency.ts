// The currencies ReelSpy can bill in, and the pure helpers for choosing and
// formatting one. Client-safe on purpose (no server or DB imports): the price
// cards, the confirmation dialogs and the currency switcher all need this, and
// so does the server when it resolves what to actually charge.
//
// Amounts are always MINOR units (fils/cents) end to end, matching Stripe, so
// nothing has to convert between major and minor and get it wrong.

export const CURRENCIES = ["aed", "sar", "usd"] as const;
export type Currency = (typeof CURRENCIES)[number];

// AED is the fallback rather than USD so an environment with no geo header —
// local dev, CI, a self-hosted preview — behaves exactly as the app did before
// multi-currency existed.
export const DEFAULT_CURRENCY: Currency = "aed";

export function isCurrency(value: unknown): value is Currency {
  return typeof value === "string" && (CURRENCIES as readonly string[]).includes(value);
}

export function normalizeCurrency(value: unknown): Currency | null {
  if (typeof value !== "string") return null;
  const lower = value.trim().toLowerCase();
  return isCurrency(lower) ? lower : null;
}

// Set from the visitor's country on their first page view and readable by both
// the server and the switcher. Deliberately NOT folded into reelspy_prefs: the
// middleware writes this one, and the preferences form rewrites that whole
// cookie as JSON from the client — sharing it would let the two clobber each
// other on the same request.
export const CURRENCY_COOKIE = "reelspy_currency";

// Which currency to quote a visitor from a given country. The Gulf currencies
// are pegged to the dollar, so this is a presentation choice — nobody's price
// moves with an exchange rate — and everyone else is billed in USD.
export function currencyForCountry(countryCode: string | null | undefined): Currency {
  switch (countryCode?.trim().toUpperCase()) {
    case "AE":
      return "aed";
    case "SA":
      return "sar";
    default:
      return "usd";
  }
}

export const CURRENCY_LABELS: Record<Currency, string> = {
  aed: "AED — UAE dirham",
  sar: "SAR — Saudi riyal",
  usd: "USD — US dollar",
};

// A price for display, from MINOR units. Uses Intl so the symbol, grouping and
// digit shaping follow the reader's language — an Arabic reader sees Arabic
// numerals and an Arabic currency name — rather than the "AED 149" string
// concatenation this replaces.
//
// Trailing ".00" is dropped: plan prices are whole numbers and "AED 149.00"
// reads like a receipt, not a price tag. A non-round amount keeps its decimals.
export function formatPrice(
  amountMinor: number,
  currency: Currency,
  locale: string = "en"
): string {
  const major = amountMinor / 100;
  const whole = Number.isInteger(major);
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(major);
  } catch {
    // An unexpected locale must never break a price. Fall back to the plainest
    // possible rendering rather than showing nothing.
    return `${currency.toUpperCase()} ${whole ? major : major.toFixed(2)}`;
  }
}
