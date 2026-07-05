"use client";

// Client-side access to the translation dictionary + active locale, without
// prop-drilling `dict` through every component tree. The root layout (a
// server component) resolves the locale from the prefs cookie, looks up the
// dictionary once, and passes both down as plain serializable props — every
// client component below can then call `useDict()`/`useLocale()` directly.

import { createContext, useContext, type ReactNode } from "react";
import type { Dict } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";

type I18nContextValue = { dict: Dict; locale: Locale };

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  dict,
  locale,
  children,
}: I18nContextValue & { children: ReactNode }) {
  return <I18nContext.Provider value={{ dict, locale }}>{children}</I18nContext.Provider>;
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
