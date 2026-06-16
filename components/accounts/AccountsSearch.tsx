"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";

type AccountsSearchProps = {
  current: string;
};

export function AccountsSearch({ current }: AccountsSearchProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState(current);
  const [synced, setSynced] = useState(current);

  // Keep in sync when navigation changes the query externally (back button).
  if (current !== synced) {
    setSynced(current);
    setValue(current);
  }

  const apply = (q: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (q) {
      next.set("q", q);
    } else {
      next.delete("q");
    }
    next.delete("page");
    const query = next.toString();
    startTransition(() => router.push(query ? `${pathname}?${query}` : pathname));
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        apply(value.trim());
      }}
      className="flex gap-2"
    >
      <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Search accounts…"
          className="h-9 w-full rounded-lg border border-border-strong bg-surface-2 pl-9 pr-8 text-sm text-foreground placeholder:text-subtle outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
        />
        {current ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setValue("");
              apply("");
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-subtle transition hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="flex h-9 items-center gap-1.5 rounded-lg border border-border-strong bg-surface-2 px-3 text-sm text-muted-foreground transition hover:border-primary/60 hover:text-brand disabled:opacity-60"
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        Search
      </button>
    </form>
  );
}
