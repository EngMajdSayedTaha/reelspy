"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

type AccountsFilterProps = {
  current: string;
  counts: { all: number; active: number; paused: number };
};

const OPTIONS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
] as const;

export function AccountsFilter({ current, counts }: AccountsFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

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
                ? "border-[#F9E400] bg-[#F9E400]/10 text-[#F9E400]"
                : "border-[#262626] bg-[#141414] text-zinc-300 hover:border-zinc-500"
            }`}
          >
            {o.label}
            <span
              className={`rounded-full px-1.5 text-xs ${
                active ? "bg-[#F9E400]/20 text-[#F9E400]" : "bg-[#1f1f1f] text-zinc-400"
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
