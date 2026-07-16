"use client";

import { Check } from "lucide-react";

type Props = {
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  multi?: boolean;
};

// One-tap chip picker shared by the onboarding quiz's niche/tone/language
// steps. Selection state lives with the caller — this just renders the row
// and reports taps; `multi` only changes the group's a11y role.
export function ChipGroup({ options, selected, onToggle, multi = false }: Props) {
  const isSelected = (option: string) => selected.some((s) => s.toLowerCase() === option.toLowerCase());

  return (
    <div className="flex flex-wrap gap-2" role={multi ? "group" : "radiogroup"}>
      {options.map((option) => {
        const selectedState = isSelected(option);
        return (
          <button
            key={option}
            type="button"
            aria-pressed={selectedState}
            onClick={() => onToggle(option)}
            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition ${
              selectedState
                ? "border-primary/60 bg-primary/15 text-foreground"
                : "border-border-strong bg-surface-2 text-muted-foreground hover:border-primary/40 hover:text-foreground"
            }`}
          >
            {selectedState ? <Check className="h-3 w-3" /> : null}
            {option}
          </button>
        );
      })}
    </div>
  );
}
