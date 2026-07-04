"use client";

import { useRouter } from "next/navigation";
import { ALL_NICHES, type NicheSummary } from "@/lib/trends/shared";

type Props = {
  niches: NicheSummary[];
  selected: string;
};

// Niche selector for the radar (X3). Chip row on wider screens, a native select
// on mobile. Switching updates the `?niche=` param (server re-queries). "All
// niches" = the whole userbase's tracked set.
export function NichePicker({ niches, selected }: Props) {
  const router = useRouter();

  const go = (niche: string) => {
    const url = niche === ALL_NICHES ? "/dashboard/trends" : `/dashboard/trends?niche=${encodeURIComponent(niche)}`;
    router.push(url);
  };

  const options = [{ niche: ALL_NICHES, label: "All niches", accountCount: 0 }, ...niches.map((n) => ({ niche: n.niche, label: n.niche, accountCount: n.accountCount }))];

  return (
    <>
      {/* Mobile: select */}
      <select
        aria-label="Niche"
        value={selected}
        onChange={(e) => go(e.target.value)}
        className="h-9 w-full rounded-lg border border-border-strong bg-surface-2 px-3 text-sm text-foreground outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20 sm:hidden"
      >
        {options.map((o) => (
          <option key={o.niche} value={o.niche}>
            {o.label}
            {o.accountCount ? ` (${o.accountCount})` : ""}
          </option>
        ))}
      </select>

      {/* Desktop: chips */}
      <div className="hidden flex-wrap gap-2 sm:flex">
        {options.map((o) => {
          const active = o.niche === selected;
          return (
            <button
              key={o.niche}
              type="button"
              onClick={() => go(o.niche)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium capitalize transition ${
                active
                  ? "bg-primary/15 text-brand ring-1 ring-primary/40"
                  : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              {o.label}
              {o.accountCount ? (
                <span className="text-xs text-subtle">{o.accountCount}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </>
  );
}
