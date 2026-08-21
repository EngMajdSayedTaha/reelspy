"use client";

import { cn } from "@/lib/utils";

// The switch used throughout the alert settings. Same visual language as the
// waiting-list card's toggle, pulled out as a component because this page has
// twenty of them and a per-file copy would drift.
export function Toggle({
  label,
  checked,
  busy,
  disabled,
  onChange,
  size = "default",
}: {
  /** Accessible name — the visible label lives in the calling row. */
  label: string;
  checked: boolean;
  busy?: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  size?: "default" | "sm";
}) {
  const small = size === "sm";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative shrink-0 rounded-full transition-colors disabled:opacity-50",
        small ? "h-5 w-9" : "h-6 w-11",
        checked ? "bg-accent-brand" : "bg-secondary ring-1 ring-border"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 rounded-full bg-background shadow transition-all",
          small ? "h-4 w-4" : "h-5 w-5",
          checked ? (small ? "start-[18px]" : "start-[22px]") : "start-0.5",
          busy && "animate-pulse"
        )}
      />
    </button>
  );
}

// Two-to-four mutually exclusive choices, rendered as a segmented control.
// Used for the severity floor, instant-vs-digest routing and the digest
// interval: each is a small closed set where seeing every option at once is
// the point, which a dropdown hides.
export function SegmentedControl<T extends string | number>({
  value,
  options,
  onChange,
  disabled,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: string; hint?: string }[];
  onChange: (next: T) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex rounded-lg bg-secondary p-0.5 ring-1 ring-border"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={active}
            title={option.hint}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition disabled:opacity-50",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
