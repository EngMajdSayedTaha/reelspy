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
