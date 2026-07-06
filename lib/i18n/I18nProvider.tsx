"use client";

// Client-side access to the translation dictionary + active locale, without
// prop-drilling `dict` through every component tree. The root layout (a
// server component) resolves the locale from the prefs cookie and passes
// only that plain string down; the dictionary itself is looked up here, in
// the client bundle, since some dictionary entries are functions (for
// pluralized/parameterized strings) and functions can't cross the server →
// client prop boundary that Next.js's RSC serialization enforces.

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { getDictionary, type Dict } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";

type I18nContextValue = { dict: Dict; locale: Locale };

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  locale,
  children,
}: { locale: Locale; children: ReactNode }) {
  const value = useMemo(() => ({ dict: getDictionary(locale), locale }), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useDict(): Dict {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useDict must be used within an I18nProvider");
  return ctx.dict;
}

export function useLocale(): Locale {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useLocale must be used within an I18nProvider");
  return ctx.locale;
}
