"use client";

import { TrendingDown, TrendingUp } from "lucide-react";

/**
 * Presentational chart chrome shared by every analytics surface in the app.
 *
 * These started life inside `components/instagram/InsightsCharts.tsx`, which
 * only ever rendered the user's OWN Instagram account. The account dossier at
 * `/dashboard/accounts/[id]` needs the same chrome around completely different
 * data, so they moved here unchanged — every one of them is pure and takes no
 * Instagram-shaped props.
 */

/** Compact toggle used for range/metric switchers. */
export function Pill({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-accent-brand text-accent-brand-foreground"
          : "bg-secondary text-muted-foreground hover:bg-border-strong hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

/** Anchor-styled sibling of `Pill`, for section nav / deep links. */
export function PillLink({
  href,
  active,
  children,
}: {
  href: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-accent-brand text-accent-brand-foreground"
          : "bg-secondary text-muted-foreground hover:bg-border-strong hover:text-foreground"
      }`}
    >
      {children}
    </a>
  );
}

/** Titled surface every chart sits on. */
export function ChartCard({
  title,
  icon,
  hint,
  className = "",
  actions,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  hint?: string;
  className?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border border-border bg-surface-2 p-4 ${className}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <span className="text-brand">{icon}</span>
          {title}
          {hint ? <span className="ms-1 text-[11px] font-normal text-subtle">{hint}</span> : null}
        </h3>
        {actions}
      </div>
      {children}
    </div>
  );
}

/** Floating tooltip anchored at a horizontal percentage inside a chart. */
export function ChartTooltip({ leftPct, children }: { leftPct: number; children: React.ReactNode }) {
  const clamped = Math.min(86, Math.max(14, leftPct));
  return (
    <div
      className="pointer-events-none absolute top-0 z-10 w-44 -translate-x-1/2 -translate-y-2 rounded-lg border border-border-strong bg-background/95 p-2.5 shadow-xl backdrop-blur-sm"
      style={{ left: `${clamped}%` }}
    >
      {children}
    </div>
  );
}

export function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta == null) return null;
  const up = delta >= 0;
  return (
    <span
      className={`flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
        up ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
      }`}
    >
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? "+" : ""}
      {delta.toFixed(0)}%
    </span>
  );
}

export function KpiCard({
  label,
  value,
  delta,
  icon,
  hint,
  footnote,
}: {
  label: string;
  value: string;
  delta?: number | null;
  icon: React.ReactNode;
  /** Native tooltip — the place to put a caveat the number can't carry itself. */
  hint?: string;
  footnote?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-2 p-3.5" title={hint}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs text-subtle">
          {icon}
          {label}
        </span>
        {delta !== undefined ? <DeltaBadge delta={delta} /> : null}
      </div>
      <p className="mt-1.5 text-xl font-semibold text-foreground">{value}</p>
      {footnote ? <p className="mt-0.5 text-[11px] text-subtle">{footnote}</p> : null}
    </div>
  );
}
