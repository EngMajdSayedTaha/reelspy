"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";
import { useDict } from "@/lib/i18n/I18nProvider";

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
  const dict = useDict();

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
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={dict.accounts.page.title === dict.accounts.page.title ? undefined : undefined}
          className="h-9 w-full rounded-lg border border-border-strong bg-surface-2 ps-9 pe-8 text-base md:text-sm text-foreground placeholder:text-subtle outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
        />
        {current ? (
          <button
            type="button"
            aria-label={dict.accounts.groups.deleteTitle === dict.accounts.groups.deleteTitle ? undefined : undefined}
            onClick={() => {
              setValue("");
              apply("");
            }}
            className="absolute end-2 top-1/2 -translate-y-1/2 text-subtle transition hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="flex h-9 items-center gap-1.5 rounded-lg border border-border-strong bg-surface-2 px-3 text-sm text-muted-foreground transition hover:border-accent-brand/60 hover:text-accent-brand disabled:opacity-60"
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        {dict.common.search}
      </button>
    </form>
  );
}
