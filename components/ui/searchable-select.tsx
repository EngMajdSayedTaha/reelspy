"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { useDict } from "@/lib/i18n/I18nProvider";

export type SearchableOption = { value: string; label: string };

type SearchableSelectProps = {
  options: SearchableOption[];
  value: string;
  onChange: (value: string) => void;
  /** Option shown first and used when nothing specific is selected. */
  allOption?: SearchableOption;
  placeholder?: string;
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
};

// Lightweight combobox: a select-styled trigger that opens a panel with a
// search input and a filtered option list. No portal — fine inside cards.
export function SearchableSelect({
  options,
  value,
  onChange,
  allOption,
  placeholder,
  ariaLabel,
  disabled,
  className,
}: SearchableSelectProps) {
  const dict = useDict().common;
  const resolvedPlaceholder = placeholder ?? dict.searchPlaceholder;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const all = useMemo(
    () => (allOption ? [allOption, ...options] : options),
    [allOption, options]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((o) => o.label.toLowerCase().includes(q));
  }, [all, query]);

  const current = all.find((o) => o.value === value) ?? allOption ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // Open with a clean slate (instead of resetting via an effect).
  const toggleOpen = () => {
    setOpen((v) => {
      if (!v) {
        setQuery("");
        setHighlight(0);
      }
      return !v;
    });
  };

  const select = (option: SearchableOption) => {
    onChange(option.value);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const option = filtered[highlight];
      if (option) select(option);
    }
  };

  return (
    <div ref={rootRef} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        disabled={disabled}
        onClick={toggleOpen}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-border-strong bg-surface-2 px-3 text-sm text-foreground outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
      >
        <span className="truncate">{current?.label ?? resolvedPlaceholder}</span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-subtle" />
      </button>

      {open ? (
        <div className="absolute start-0 top-full z-30 mt-1 w-full min-w-[220px] overflow-hidden rounded-lg border border-border-strong bg-surface-2 shadow-xl shadow-black/50">
          <div className="relative border-b border-border-strong">
            <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlight(0);
              }}
              onKeyDown={onKeyDown}
              placeholder={resolvedPlaceholder}
              className="h-9 w-full bg-transparent ps-8 pe-3 text-base md:text-sm text-foreground placeholder:text-subtle outline-none"
            />
          </div>

          <div className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-subtle">{dict.noResults}</p>
            ) : (
              filtered.map((option, i) => {
                const selected = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => select(option)}
                    onMouseEnter={() => setHighlight(i)}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-start text-sm transition ${
                      i === highlight ? "bg-border text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    <span className="truncate">{option.label}</span>
                    {selected ? <Check className="h-3.5 w-3.5 shrink-0 text-brand" /> : null}
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
