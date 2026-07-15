import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

// Compact metric tile for the admin Overview / analytics grids. Optionally a
// link (whole card becomes clickable) and an accent tone for alert states.
export function StatCard({
  label,
  value,
  hint,
  href,
  tone = "default",
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  href?: string;
  tone?: "default" | "warning" | "danger" | "success";
  icon?: ReactNode;
}) {
  const toneRing =
    tone === "danger"
      ? "ring-destructive/30"
      : tone === "warning"
        ? "ring-warning/30"
        : tone === "success"
          ? "ring-success/30"
          : "ring-foreground/10";

  const body = (
    <div className={cn("flex flex-col gap-1 rounded-xl bg-card p-4 ring-1", toneRing)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {icon ? <span className="text-muted-foreground">{icon}</span> : null}
      </div>
      <span className="text-2xl font-semibold tabular-nums text-foreground">{value}</span>
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="transition hover:opacity-90">
        {body}
      </Link>
    );
  }
  return body;
}
