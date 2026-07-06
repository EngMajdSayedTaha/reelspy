"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { useDict } from "@/lib/i18n/I18nProvider";

type AccountsFilterProps = {
  current: string;
  counts: { all: number; active: number; paused: number };
};

export function AccountsFilter({ current, counts }: AccountsFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const dict = useDict();

  const OPTIONS = [
    { value: "all", label: dict.accounts.filter.all },
    { value: "active", label: dict.accounts.filter.active },
    { value: "paused", label: dict.accounts.filter.paused },
  ] as const;

  const select = (value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value === "all") {
      next.delete("status");
    } else {
      next.set("status", value);
    }
    next.delete("page");
    const query = next.toString();
    startTransition(() => router.push(query ? `${pathname}?${query}` : pathname));
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {OPTIONS.map((o) => {
        const active = current === o.value;
        return (
          <button
            key={o.value}
            type="button"
            disabled={isPending}
            onClick={() => select(o.value)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition disabled:opacity-60 ${
              active
                ? "border-primary bg-primary/10 text-brand"
                : "border-border-strong bg-surface-2 text-muted-foreground hover:border-border-strong"
            }`}
          >
            {o.label}
            <span
              className={`rounded-full px-1.5 text-xs ${
                active ? "bg-primary/20 text-brand" : "bg-border text-muted-foreground"
              }`}
            >
              {counts[o.value]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
