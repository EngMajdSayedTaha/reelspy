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
