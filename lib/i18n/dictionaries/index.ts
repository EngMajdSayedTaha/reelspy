// Composed translation dictionary. Each domain (shell, common, accounts,
// feed, …) owns one file exporting `{ <domainKey>Ex1: {...} }`-shaped en/ar
// objects under a single top-level namespace (e.g. `{ accounts: {...} }`);
// this file merges every domain's `en` into the canonical `Dict` shape and
// every domain's `ar` into a same-shaped object. Because `Dict` is inferred
// from the merged English object, a missing/renamed key in any locale is a
// compile error, not a silent English fallback — add a new domain by adding
// one line to each of the three spreads below.

import type { Locale } from "@/lib/i18n/config";
import { shellEn, shellAr } from "./shell";
import { commonEn, commonAr } from "./common";

const en = {
  ...shellEn,
  ...commonEn,
};

export type Dict = typeof en;

const ar: Dict = {
  ...shellAr,
  ...commonAr,
};

const DICTIONARIES: Record<Locale, Dict> = { en, ar };

export function getDictionary(locale: Locale): Dict {
  return DICTIONARIES[locale] ?? en;
}
