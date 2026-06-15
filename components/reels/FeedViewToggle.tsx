"use client";

import { LayoutGrid, Rows3, Clapperboard, type LucideIcon } from "lucide-react";

export type FeedView = "grid" | "list" | "reels";

const VIEWS: { value: FeedView; label: string; icon: LucideIcon }[] = [
  { value: "grid", label: "Grid", icon: LayoutGrid },
  { value: "list", label: "List", icon: Rows3 },
  { value: "reels", label: "Reels", icon: Clapperboard },
];

export function FeedViewToggle({
  value,
  onChange,
}: {
  value: FeedView;
  onChange: (view: FeedView) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Feed layout"
      className="flex items-center gap-1 rounded-lg border border-border bg-surface-2 p-1"
    >
      {VIEWS.map(({ value: v, label, icon: Icon }) => {
        const selected = value === v;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={selected}
            title={`${label} view`}
            onClick={() => onChange(v)}
            className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition ${
              selected
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
