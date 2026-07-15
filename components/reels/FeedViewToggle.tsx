"use client";

import { LayoutGrid, Rows3, Clapperboard, type LucideIcon } from "lucide-react";
import { useDict } from "@/lib/i18n/I18nProvider";

export type FeedView = "grid" | "list" | "reels";

const VIEWS: { value: FeedView; icon: LucideIcon }[] = [
  { value: "grid", icon: LayoutGrid },
  { value: "list", icon: Rows3 },
  { value: "reels", icon: Clapperboard },
];

export function FeedViewToggle({
  value,
  onChange,
}: {
  value: FeedView;
  onChange: (view: FeedView) => void;
}) {
  const dict = useDict().feed.viewToggle;
  return (
    <div
      role="radiogroup"
      aria-label={dict.ariaLabel}
      className="flex items-center gap-1 rounded-lg border border-border bg-surface-2 p-1"
    >
      {VIEWS.map(({ value: v, icon: Icon }) => {
        const selected = value === v;
        const label = dict[v];
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={selected}
            title={dict.viewTitle(label)}
            onClick={() => onChange(v)}
            className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition ${
              selected
                ? "bg-accent-brand text-accent-brand-foreground"
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
