import type { Locale } from "@/lib/i18n/config";

// BCP-47 tag for `Intl.*`/`toLocale*String` calls. Forces Latin digits even in
// Arabic (`-u-nu-latn`) so numbers stay consistent with the rest of the app's
// digit-agnostic numeric formatting (e.g. `formatCompact`'s "1.2K") — only
// weekday/month *names* actually localize to Arabic. Use this instead of a
// bare "en-US"/"ar" literal wherever the codebase formats a date or number for
// display.
export function intlLocale(locale: Locale): string {
  return locale === "ar" ? "ar-AE-u-nu-latn" : "en-US";
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 60 * 60 * 24 * 365],
  ["month", 60 * 60 * 24 * 30],
  ["week", 60 * 60 * 24 * 7],
  ["day", 60 * 60 * 24],
  ["hour", 60 * 60],
  ["minute", 60],
];

// Compact relative age ("3 hours ago" / "قبل 3 ساعات") for timestamps like
// last_synced_at where a full date is more precision than the UI needs.
export function relativeTime(date: string | Date, locale: Locale): string {
  const then = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.max(0, Math.round((Date.now() - then.getTime()) / 1000));
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "auto" });

  for (const [unit, secondsInUnit] of RELATIVE_UNITS) {
    if (seconds >= secondsInUnit) {
      return rtf.format(-Math.round(seconds / secondsInUnit), unit);
    }
  }
  return rtf.format(0, "second");
}
