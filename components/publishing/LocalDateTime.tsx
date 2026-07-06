"use client";

import { useSyncExternalStore } from "react";
import { useLocale } from "@/lib/i18n/I18nProvider";
import { intlLocale } from "@/lib/i18n/intl";

const OPTS: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

const UTC_OPTS: Intl.DateTimeFormatOptions = { ...OPTS, timeZone: "UTC" };

// Constant subscribe: the "store" (are we hydrated yet?) never actually changes
// after the first client render, so there's nothing to subscribe to.
const subscribe = () => () => {};

// Renders a DB/ISO timestamp in the *viewer's* local timezone.
//
// The publishing page is a server component, so formatting there runs in the
// server's timezone (UTC on Vercel) — which made an 8:15 PM Dubai schedule read
// back as 4:15 PM. We format in UTC for the server render and the first client
// (hydration) render so the markup matches exactly, then useSyncExternalStore
// flips to the browser's timezone on the post-hydration re-render.
export function LocalDateTime({ value, prefix }: { value: string; prefix?: string }) {
  const locale = useLocale();
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true, // client
    () => false // server
  );
  const text = new Date(value).toLocaleString(intlLocale(locale), hydrated ? OPTS : UTC_OPTS);

  return (
    <span suppressHydrationWarning>
      {prefix}
      {text}
    </span>
  );
}
