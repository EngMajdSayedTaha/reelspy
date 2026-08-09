"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CURRENCIES,
  CURRENCY_COOKIE,
  CURRENCY_LABELS,
  type Currency,
} from "@/lib/billing/currency";

// Lets a visitor price the plans in a currency other than the one their location
// implies. Writes the same cookie the middleware seeds and re-renders the server
// component, so the prices, the checkout and the confirmation quotes all move
// together — there is no client-side conversion anywhere.
//
// DISABLED for an existing subscriber, because Stripe locks a subscription's
// currency for its lifetime. Offering the choice would be offering something we
// can't deliver, so it says why instead.

export function CurrencySwitcher({
  value,
  locked,
  lockedLabel,
}: {
  value: Currency;
  locked: boolean;
  lockedLabel: string;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState<Currency>(value);
  const [pending, startTransition] = useTransition();

  if (locked) {
    return <p className="text-xs text-muted-foreground">{lockedLabel}</p>;
  }

  const change = (next: Currency) => {
    setCurrent(next);
    document.cookie = `${CURRENCY_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    startTransition(() => router.refresh());
  };

  return (
    <select
      value={current}
      disabled={pending}
      onChange={(e) => change(e.target.value as Currency)}
      aria-label="Currency"
      className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 dark:bg-input/30"
    >
      {CURRENCIES.map((code) => (
        <option key={code} value={code}>
          {CURRENCY_LABELS[code]}
        </option>
      ))}
    </select>
  );
}
