// User preferences, stored in a plain (non-httpOnly) cookie so both server
// components and client widgets can read them without a DB round-trip. Nothing
// sensitive lives here — it's UI tuning only.

import { DEFAULT_LOCALE, normalizeLocale, type Locale } from "@/lib/i18n/config";

export const PREFS_COOKIE = "reelspy_prefs";

export type UserPrefs = {
  /** How long toast notifications stay on screen (ms). */
  toastMs: number;
  /** Default "reels per account" for sync buttons. */
  syncLimit: number;
  /** Default feed page size. */
  feedPerPage: number;
  /** Interface language (drives dir/lang). */
  locale: Locale;
};

export const TOAST_MS_OPTIONS = [3000, 5000, 8000, 12000] as const;
export const SYNC_LIMIT_OPTIONS = [25, 50, 100, 200] as const;
export const FEED_PER_PAGE_OPTIONS = [10, 25] as const;

export const DEFAULT_PREFS: UserPrefs = {
  toastMs: 5000,
  syncLimit: 25,
  feedPerPage: 10,
  locale: DEFAULT_LOCALE,
};

function pick<T extends number>(value: unknown, allowed: readonly T[], fallback: T): T {
  const n = typeof value === "number" ? value : Number(value);
  return (allowed as readonly number[]).includes(n) ? (n as T) : fallback;
}

// Tolerant parse: any malformed/missing cookie falls back to defaults.
export function parsePrefs(raw: string | undefined | null): UserPrefs {
  if (!raw) return DEFAULT_PREFS;
  try {
    const json = JSON.parse(decodeURIComponent(raw)) as Partial<UserPrefs>;
    return {
      toastMs: pick(json.toastMs, TOAST_MS_OPTIONS, DEFAULT_PREFS.toastMs),
      syncLimit: pick(json.syncLimit, SYNC_LIMIT_OPTIONS, DEFAULT_PREFS.syncLimit),
      feedPerPage: pick(json.feedPerPage, FEED_PER_PAGE_OPTIONS, DEFAULT_PREFS.feedPerPage),
      locale: normalizeLocale(json.locale),
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function serializePrefs(prefs: UserPrefs): string {
  return encodeURIComponent(JSON.stringify(prefs));
}

// Browser-side read (document.cookie). Safe to call during render on the
// client; returns defaults during SSR.
export function getClientPrefs(): UserPrefs {
  if (typeof document === "undefined") return DEFAULT_PREFS;
  const match = document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${PREFS_COOKIE}=`));
  return parsePrefs(match ? match.slice(PREFS_COOKIE.length + 1) : undefined);
}
