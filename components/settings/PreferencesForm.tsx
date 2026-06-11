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

type PreferencesFormProps = {
  initial: UserPrefs;
  action: (formData: FormData) => Promise<void>;
};

const selectClass =
  "h-9 w-full rounded-lg border border-[#262626] bg-[#141414] px-3 text-sm text-zinc-200 outline-none transition focus:border-[#F9E400]/60 focus:ring-2 focus:ring-[#F9E400]/20 disabled:opacity-60";

export function PreferencesForm({ initial, action }: PreferencesFormProps) {
  const [toastMs, setToastMs] = useState(initial.toastMs);
  const [syncLimit, setSyncLimit] = useState(initial.syncLimit);
  const [feedPerPage, setFeedPerPage] = useState(initial.feedPerPage);
  const [isPending, startTransition] = useTransition();

  const save = () => {
    const data = new FormData();
    data.set("toastMs", String(toastMs));
    data.set("syncLimit", String(syncLimit));
    data.set("feedPerPage", String(feedPerPage));
    startTransition(async () => {
      try {
        await action(data);
        window.dispatchEvent(new CustomEvent("reelspy:prefs"));
        toast.success("Preferences saved", { duration: toastMs });
      } catch {
        toast.error("Could not save preferences.");
      }
    });
  };

  return (
    <section className="rounded-2xl border border-[#1f1f1f] bg-[#111111] p-5 text-zinc-100">
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="h-4 w-4 text-[#F9E400]" />
        <h2 className="text-lg font-semibold text-white">Preferences</h2>
      </div>
      <p className="mt-1 text-sm text-zinc-400">
        Tune how the app behaves for you. Saved on this device.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <label className="space-y-1.5 text-sm">
          <span className="text-zinc-300">Notification duration</span>
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
          <span className="block text-xs text-zinc-500">How long toasts stay on screen.</span>
        </label>

        <label className="space-y-1.5 text-sm">
          <span className="text-zinc-300">Default sync depth</span>
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
          <span className="block text-xs text-zinc-500">Pre-selected on sync buttons.</span>
        </label>

        <label className="space-y-1.5 text-sm">
          <span className="text-zinc-300">Feed page size</span>
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
          <span className="block text-xs text-zinc-500">Default page size in the Feed.</span>
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
