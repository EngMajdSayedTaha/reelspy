"use client";

import { useState, useTransition } from "react";
import { SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  FEED_PER_PAGE_OPTIONS,
  SYNC_LIMIT_OPTIONS,
  TOAST_MS_OPTIONS,
  type UserPrefs,
} from "@/lib/prefs";
import { LOCALES, LOCALE_LABELS } from "@/lib/i18n/config";
import { useDict } from "@/lib/i18n/I18nProvider";

type PreferencesFormProps = {
  initial: UserPrefs;
  action: (formData: FormData) => Promise<void>;
};

const selectClass =
  "h-9 w-full rounded-lg border border-border-strong bg-surface-2 px-3 text-sm text-foreground outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20 disabled:opacity-60";

export function PreferencesForm({ initial, action }: PreferencesFormProps) {
  const dict = useDict();
  const t = dict.settings.preferences;
  const [toastMs, setToastMs] = useState(initial.toastMs);
  const [syncLimit, setSyncLimit] = useState(initial.syncLimit);
  const [feedPerPage, setFeedPerPage] = useState(initial.feedPerPage);
  const [locale, setLocale] = useState(initial.locale);
  const [isPending, startTransition] = useTransition();

  const save = () => {
    const data = new FormData();
    data.set("toastMs", String(toastMs));
    data.set("syncLimit", String(syncLimit));
    data.set("feedPerPage", String(feedPerPage));
    data.set("locale", locale);
    const localeChanged = locale !== initial.locale;
    startTransition(async () => {
      try {
        await action(data);
        window.dispatchEvent(new CustomEvent("reelspy:prefs"));
        // Language change flips dir/lang on <html>, which is set by the root
        // layout server-side — a full reload is the clean way to re-render it.
        if (localeChanged) {
          window.location.reload();
          return;
        }
        toast.success(t.saved, { duration: toastMs });
      } catch {
        toast.error(t.saveError);
      }
    });
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-5 text-foreground">
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="h-4 w-4 text-brand" />
        <h2 className="text-lg font-semibold text-foreground">{t.title}</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{t.subtitle}</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <label className="space-y-1.5 text-sm">
          <span className="text-muted-foreground">{dict.prefs.language}</span>
          <select
            value={locale}
            disabled={isPending}
            onChange={(e) => setLocale(e.target.value as UserPrefs["locale"])}
            className={selectClass}
          >
            {LOCALES.map((l) => (
              <option key={l} value={l}>
                {LOCALE_LABELS[l]}
              </option>
            ))}
          </select>
          <span className="block text-xs text-subtle">{dict.prefs.languageHint}</span>
        </label>

        <label className="space-y-1.5 text-sm">
          <span className="text-muted-foreground">{t.notificationDuration}</span>
          <select
            value={toastMs}
            disabled={isPending}
            onChange={(e) => setToastMs(Number(e.target.value))}
            className={selectClass}
          >
            {TOAST_MS_OPTIONS.map((ms) => (
              <option key={ms} value={ms}>
                {t.secondsLabel(ms / 1000)}
              </option>
            ))}
          </select>
          <span className="block text-xs text-subtle">{t.notificationDurationHint}</span>
        </label>

        <label className="space-y-1.5 text-sm">
          <span className="text-muted-foreground">{t.defaultSyncDepth}</span>
          <select
            value={syncLimit}
            disabled={isPending}
            onChange={(e) => setSyncLimit(Number(e.target.value))}
            className={selectClass}
          >
            {SYNC_LIMIT_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {t.reelsPerAccountLabel(n)}
              </option>
            ))}
          </select>
          <span className="block text-xs text-subtle">{t.defaultSyncDepthHint}</span>
        </label>

        <label className="space-y-1.5 text-sm">
          <span className="text-muted-foreground">{t.feedPageSize}</span>
          <select
            value={feedPerPage}
            disabled={isPending}
            onChange={(e) => setFeedPerPage(Number(e.target.value))}
            className={selectClass}
          >
            {FEED_PER_PAGE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {t.reelsPerPageLabel(n)}
              </option>
            ))}
          </select>
          <span className="block text-xs text-subtle">{t.feedPageSizeHint}</span>
        </label>
      </div>

      <div className="mt-4">
        <Button type="button" onClick={save} disabled={isPending}>
          {isPending ? dict.common.saving : t.save}
        </Button>
      </div>
    </section>
  );
}
