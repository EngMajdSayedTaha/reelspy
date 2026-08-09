// Which currency to quote a given visitor, resolved server-side.
//
// The rule that matters most: an EXISTING SUBSCRIBER'S CURRENCY NEVER CHANGES.
// Stripe locks a subscription's currency for its lifetime — there is no API to
// move one — so if we rendered a travelling subscriber's plans in the local
// currency, every price they saw would be one we couldn't actually charge them,
// and every upgrade quote would be wrong. Their recorded billing currency
// therefore beats their cookie, and their cookie beats their IP.

import "server-only";
import { cookies, headers } from "next/headers";
import {
  CURRENCY_COOKIE,
  DEFAULT_CURRENCY,
  currencyForCountry,
  normalizeCurrency,
  type Currency,
} from "@/lib/billing/currency";

export type CurrencyResolution = {
  currency: Currency;
  /** True when the subscription pins it — the switcher must be disabled. */
  locked: boolean;
};

// The visitor's country, as Vercel's edge network reports it. Absent locally and
// in tests, which is why the fallback chain ends at AED: a header-less
// environment then behaves exactly as the app did before multi-currency.
export async function visitorCountry(): Promise<string | null> {
  try {
    return (await headers()).get("x-vercel-ip-country");
  } catch {
    return null;
  }
}

export async function resolveDisplayCurrency(
  subscriptionCurrency?: string | null
): Promise<CurrencyResolution> {
  const locked = normalizeCurrency(subscriptionCurrency);
  if (locked) return { currency: locked, locked: true };

  const chosen = normalizeCurrency((await cookies()).get(CURRENCY_COOKIE)?.value);
  if (chosen) return { currency: chosen, locked: false };

  const country = await visitorCountry();
  return { currency: country ? currencyForCountry(country) : DEFAULT_CURRENCY, locked: false };
}
