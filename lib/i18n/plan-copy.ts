// Fallback plan copy, for the places that need a plan's NAME and nothing else —
// upsell messages when a cap is hit, the sidebar's plan badge.
//
// Customer-facing plan copy lives in the admin-managed catalog now
// (lib/billing/catalog.ts), but these callers are hot paths that shouldn't take
// a database round-trip just to render one word, and some of them are client
// components that can't. The dictionary blocks are kept as built-in copy for
// exactly this; an admin-created slug the dictionaries have never heard of falls
// back to the slug itself, which is a readable label rather than a crash.
//
// Anywhere the plan is the SUBJECT — the billing page's plan grid, the admin
// console — reads the catalog directly and gets the admin's own wording.

import type { Dict } from "@/lib/i18n/dictionaries";

export type BuiltinPlanCopy = { name: string; tagline: string; highlights: string[] };

function titleCase(slug: string): string {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function fallbackPlanCopy(dict: Dict, slug: string): BuiltinPlanCopy {
  const plans = dict.billing.plans as Record<string, BuiltinPlanCopy | undefined>;
  return plans[slug] ?? { name: titleCase(slug), tagline: "", highlights: [] };
}

export function fallbackPlanName(dict: Dict, slug: string): string {
  return fallbackPlanCopy(dict, slug).name;
}
