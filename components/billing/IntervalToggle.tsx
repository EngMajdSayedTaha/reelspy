import Link from "next/link";
import type { BillingInterval } from "@/lib/billing/catalog";

// Monthly / yearly, as two links rather than a client control.
//
// Every price on this page is resolved server-side, so switching interval has to
// re-render the server component. Making it a link keeps that honest: there is
// no client-side conversion, the URL is shareable, and it works before hydration.

export function IntervalToggle({
  value,
  monthlyLabel,
  yearlyLabel,
  savingLabel,
}: {
  value: BillingInterval;
  monthlyLabel: string;
  yearlyLabel: string;
  /** e.g. "Save 20%" — omitted when no yearly price beats the monthly one. */
  savingLabel?: string | null;
}) {
  const base = "rounded-md px-3 py-1.5 text-sm font-medium transition";
  const active = "bg-background text-foreground shadow-sm";
  const idle = "text-muted-foreground hover:text-foreground";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-lg bg-secondary p-1">
        <Link
          href="/dashboard/billing?interval=month"
          scroll={false}
          className={`${base} ${value === "month" ? active : idle}`}
        >
          {monthlyLabel}
        </Link>
        <Link
          href="/dashboard/billing?interval=year"
          scroll={false}
          className={`${base} ${value === "year" ? active : idle}`}
        >
          {yearlyLabel}
        </Link>
      </div>
      {savingLabel ? (
        <span className="rounded-full bg-success/15 px-2.5 py-1 text-xs font-medium text-success">
          {savingLabel}
        </span>
      ) : null}
    </div>
  );
}
