import { intlLocale } from "@/lib/i18n/intl";
import type { Locale } from "@/lib/i18n/config";

/**
 * Date formatting for the dossier.
 *
 * Everything here formats in **UTC**, on purpose. These labels describe when a
 * reel was posted, and `posted_at` is a UTC instant — rendering it in the
 * viewer's timezone would shift the date across a boundary for anyone west of
 * Greenwich, and, worse, would make the server render (server timezone) and the
 * client render (browser timezone) disagree, producing a hydration mismatch on
 * a page full of dates.
 *
 * The one place local time genuinely matters is the posting-hour heatmap, which
 * opts in explicitly and says so in its own label.
 */
export function formatDay(iso: string | null | undefined, locale: Locale): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatShortDay(iso: string | null | undefined, locale: Locale): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** One decimal, or an em dash when the metric could not be computed. */
export function formatDecimal(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

export function formatRounded(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return String(Math.round(value));
}
