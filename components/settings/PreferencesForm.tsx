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

type PreferencesFormProps = {
  initial: UserPrefs;
  action: (formData: FormData) => Promise<void>;
};

const selectClass =
  "h-9 w-full rounded-lg border border-border-strong bg-surface-2 px-3 text-sm text-foreground outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20 disabled:opacity-60";

export function PreferencesForm({ initial, action }: PreferencesFormProps) {
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
        toast.success("Preferences saved", { duration: toastMs });
      } catch {
        toast.error("Could not save preferences.");
      }
    });
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-5 text-foreground">
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="h-4 w-4 text-brand" />
        <h2 className="text-lg font-semibold text-foreground">Preferences</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Tune how the app behaves for you. Saved on this device.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <label className="space-y-1.5 text-sm">
          <span className="text-muted-foreground">Language</span>
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
          <span className="block text-xs text-subtle">Interface language and text direction.</span>
        </label>

        <label className="space-y-1.5 text-sm">
          <span className="text-muted-foreground">Notification duration</span>
          <select
            value={toastMs}
            disabled={isPending}
            onChange={(e) => setToastMs(Number(e.target.value))}
            className={selectClass}
          >
            {TOAST_MS_OPTIONS.map((ms) => (
              <option key={ms} value={ms}>
                {ms / 1000} seconds
              </option>
            ))}
          </select>
          <span className="block text-xs text-subtle">How long toasts stay on screen.</span>
        </label>

        <label className="space-y-1.5 text-sm">
          <span className="text-muted-foreground">Default sync depth</span>
          <select
            value={syncLimit}
            disabled={isPending}
            onChange={(e) => setSyncLimit(Number(e.target.value))}
            className={selectClass}
          >
            {SYNC_LIMIT_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} reels per account
              </option>
            ))}
          </select>
          <span className="block text-xs text-subtle">Pre-selected on sync buttons.</span>
        </label>

        <label className="space-y-1.5 text-sm">
          <span className="text-muted-foreground">Feed page size</span>
          <select
            value={feedPerPage}
            disabled={isPending}
            onChange={(e) => setFeedPerPage(Number(e.target.value))}
            className={selectClass}
          >
            {FEED_PER_PAGE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} reels per page
              </option>
            ))}
          </select>
          <span className="block text-xs text-subtle">Default page size in the Feed.</span>
        </label>
      </div>

      <div className="mt-4">
        <Button type="button" onClick={save} disabled={isPending}>
          {isPending ? "Saving…" : "Save preferences"}
        </Button>
      </div>
    </section>
  );
}
