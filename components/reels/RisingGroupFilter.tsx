"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Group = { id: string; name: string };

type RisingGroupFilterProps = {
  groups: Group[];
  current: string;
};

export function RisingGroupFilter({ groups, current }: RisingGroupFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const onChange = (value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value === "all") {
      next.delete("rgroup");
    } else {
      next.set("rgroup", value);
    }
    next.delete("page");
    startTransition(() => router.push(`${pathname}?${next.toString()}`));
  };

  return (
    <select
      aria-label="Rising reels group"
      value={current}
      disabled={isPending}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 rounded-lg border border-border-strong bg-surface-2 px-2 text-xs text-foreground outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
    >
      <option value="all">All groups</option>
      {groups.map((g) => (
        <option key={g.id} value={g.id}>
          {g.name}
        </option>
      ))}
    </select>
  );
}
