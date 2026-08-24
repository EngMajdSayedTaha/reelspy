"use client";

import { useState, useSyncExternalStore } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDict } from "@/lib/i18n/I18nProvider";

type Props = {
  enabled: boolean;
  onEnabled: (value: boolean) => void;
  /** `datetime-local` value, i.e. local wall-clock, not ISO. */
  value: string;
  onValue: (value: string) => void;
};

/** `Date` → the `YYYY-MM-DDTHH:mm` a datetime-local input expects. */
function toLocalInputValue(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function atHourToday(hour: number, addDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + addDays);
  d.setHours(hour, 0, 0, 0);
  return toLocalInputValue(d);
}

// Never read during SSR — the server has no idea what timezone the browser is
// in, and rendering the server's guess produces a hydration mismatch (the same
// reason components/publishing/LocalDateTime.tsx exists).
const subscribeNever = () => () => {};

export function ScheduleField({ enabled, onEnabled, value, onValue }: Props) {
  const t = useDict().publishing;
  const hydrated = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false
  );

  // Captured once per mount rather than read on every render, so the render
  // itself stays deterministic. Only used after hydration, so the server's
  // clock never reaches the DOM.
  const [minValue] = useState(() => toLocalInputValue(new Date()));

  const timezone = hydrated
    ? (Intl.DateTimeFormat().resolvedOptions().timeZone ?? "")
    : "";

  // Each chip computes its time when CLICKED, not during render — reading the
  // clock while rendering is impure, and a chip built at render time also goes
  // stale the longer the composer sits open ("In 1 hour" would mean an hour
  // after the page loaded, not an hour from now).
  const quickChips: Array<{ label: string; compute: () => string }> = [
    { label: t.quickInAnHour, compute: () => toLocalInputValue(new Date(Date.now() + 3600_000)) },
    {
      label: t.quickTonight,
      // "Tonight" has already gone by after 7pm — roll to tomorrow evening
      // rather than offering a time in the past.
      compute: () => atHourToday(19, new Date().getHours() >= 19 ? 1 : 0),
    },
    { label: t.quickTomorrow, compute: () => atHourToday(9, 1) },
  ];

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-2">
        <input type="checkbox" checked={enabled} onChange={(e) => onEnabled(e.target.checked)} />
        {t.scheduleForLater}
      </Label>

      {enabled ? (
        <div className="space-y-2">
          <Input
            type="datetime-local"
            value={value}
            min={hydrated ? minValue : undefined}
            onChange={(e) => onValue(e.target.value)}
            aria-label={t.scheduledTimeLabel}
          />
          {hydrated ? (
            <div className="flex flex-wrap gap-1.5">
              {quickChips.map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => onValue(chip.compute())}
                  className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition hover:border-accent-brand hover:text-accent-brand"
                >
                  {chip.label}
                </button>
              ))}
            </div>
          ) : null}
          {timezone ? <p className="text-xs text-subtle">{t.timezoneNote(timezone)}</p> : null}
        </div>
      ) : (
        <p className="text-xs text-subtle">{t.leaveOffHint}</p>
      )}
    </div>
  );
}
