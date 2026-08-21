"use client";

import { useMemo, useState, type RefObject } from "react";
import { ChevronLeft, ChevronRight, Shuffle, Sparkles, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDict } from "@/lib/i18n/I18nProvider";
import {
  applySuggestion,
  cycleIndex,
  insertAtSelection,
  pickRandomIcon,
  randomOtherIndex,
  type SuggestionApplyMode,
} from "@/lib/auto-reply/suggestion-flipper";

type SuggestionFlipperProps = {
  /** Curated sentences to flip through — usually `dict.automations.suggestions.*`. */
  suggestions: string[];
  value: string;
  onChange: (next: string) => void;
  /**
   * "replace" for single-message fields (DM/reply text) — the picked
   * suggestion becomes the field. "append-line" for rotated multi-template
   * fields (public replies) — it's added as a new rotation line instead.
   */
  applyMode?: SuggestionApplyMode;
  /** When given, shows a "random icon" button that inserts one at the cursor. */
  icons?: string[];
  /** The textarea this flipper edits — needed for cursor-aware icon insertion. */
  targetRef?: RefObject<HTMLTextAreaElement | null>;
  disabled?: boolean;
  className?: string;
};

const iconBtnClass =
  "flex h-7 w-7 items-center justify-center rounded-md border border-border-strong bg-surface-2 text-muted-foreground transition hover:border-accent-brand/60 hover:text-accent-brand disabled:cursor-not-allowed disabled:opacity-40";

// Buttons in this widget must never steal focus from the textarea they edit —
// losing focus loses the cursor/selection the "insert icon" button relies on.
// Preventing the default mousedown behavior keeps focus (and selection) put.
function keepFocus(e: React.MouseEvent) {
  e.preventDefault();
}

export function SuggestionFlipper({
  suggestions,
  value,
  onChange,
  applyMode = "replace",
  icons,
  targetRef,
  disabled,
  className,
}: SuggestionFlipperProps) {
  const dict = useDict().automations.suggestions;
  const [index, setIndex] = useState(0);
  const usable = useMemo(() => suggestions.filter((s) => s.trim()), [suggestions]);
  const current = usable[Math.min(index, usable.length - 1)] ?? "";

  if (usable.length === 0) return null;

  const apply = () => {
    if (!current) return;
    onChange(applySuggestion(value, current, applyMode));
  };

  const insertIcon = () => {
    if (!icons || icons.length === 0) return;
    const icon = pickRandomIcon(icons);
    const el = targetRef?.current ?? null;
    if (el && document.activeElement === el) {
      const { text, cursor } = insertAtSelection(value, icon, el.selectionStart, el.selectionEnd);
      onChange(text);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(cursor, cursor);
      });
      return;
    }
    onChange(value.trim() ? `${value.replace(/\s+$/, "")} ${icon}` : icon);
  };

  return (
    <div
      className={cn(
        "space-y-2 rounded-lg border border-dashed border-border-strong bg-surface-2/60 p-2.5",
        className
      )}
    >
      <div className="flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-brand" />
        <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={current}>
          {current}
        </p>
        <span className="shrink-0 text-[10px] tabular-nums text-subtle">
          {index % usable.length + 1}/{usable.length}
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onMouseDown={keepFocus}
            onClick={() => setIndex((i) => cycleIndex(i, -1, usable.length))}
            disabled={disabled}
            className={iconBtnClass}
            aria-label={dict.prevAria}
          >
            <ChevronLeft className="h-3.5 w-3.5 rtl:rotate-180" />
          </button>
          <button
            type="button"
            onMouseDown={keepFocus}
            onClick={() => setIndex((i) => randomOtherIndex(i, usable.length))}
            disabled={disabled}
            className={iconBtnClass}
            aria-label={dict.shuffleAria}
            title={dict.shuffleAria}
          >
            <Shuffle className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={keepFocus}
            onClick={() => setIndex((i) => cycleIndex(i, 1, usable.length))}
            disabled={disabled}
            className={iconBtnClass}
            aria-label={dict.nextAria}
          >
            <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {icons && icons.length > 0 ? (
            <button
              type="button"
              onMouseDown={keepFocus}
              onClick={insertIcon}
              disabled={disabled}
              className="flex items-center gap-1 rounded-md border border-border-strong bg-surface-2 px-2 py-1 text-xs text-muted-foreground transition hover:border-accent-brand/60 hover:text-accent-brand disabled:cursor-not-allowed disabled:opacity-40"
              title={dict.iconButtonTitle}
            >
              <Wand2 className="h-3.5 w-3.5" />
              {dict.iconButtonLabel}
            </button>
          ) : null}
          <button
            type="button"
            onMouseDown={keepFocus}
            onClick={apply}
            disabled={disabled}
            className="rounded-md bg-brand/10 px-2.5 py-1 text-xs font-medium text-brand transition hover:bg-brand/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {dict.useThis}
          </button>
        </div>
      </div>
    </div>
  );
}
