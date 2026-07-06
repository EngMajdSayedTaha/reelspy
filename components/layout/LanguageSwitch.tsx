"use client";

import { useTransition } from "react";
import { Languages } from "lucide-react";
import { setLocale } from "@/lib/i18n/actions";
import { LOCALE_LABELS, type Locale } from "@/lib/i18n/config";

type LanguageSwitchProps = {
  locale: Locale;
  label: string;
};

// Compact navbar toggle between the two supported locales. Badge shows the
// language you'll switch *to*; the icon spins mid-request and nudges on
// hover so it doesn't just sit there as a flat globe glyph.
export function LanguageSwitch({ locale, label }: LanguageSwitchProps) {
  const [isPending, startTransition] = useTransition();
  const next: Locale = locale === "ar" ? "en" : "ar";

  const toggle = () => {
    startTransition(async () => {
      await setLocale(next);
      // dir/lang live on <html>, set server-side in the root layout — reload
      // is the clean way to re-render it (same pattern as PreferencesForm).
      window.location.reload();
    });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={isPending}
      aria-label={label}
      title={`${label}: ${LOCALE_LABELS[next]}`}
      className="group relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border-strong bg-secondary/60 text-muted-foreground transition hover:border-primary/60 hover:text-brand hover:shadow-[0_0_0_4px_rgba(249,228,0,0.15)] disabled:opacity-60"
    >
      <Languages
        className={`h-[18px] w-[18px] transition-transform duration-300 ${
          isPending ? "animate-spin" : "group-hover:-rotate-12 group-hover:scale-110"
        }`}
      />
      <span className="absolute -bottom-1 -end-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold leading-none text-primary-foreground shadow-sm">
        {next.toUpperCase()}
      </span>
    </button>
  );
}
