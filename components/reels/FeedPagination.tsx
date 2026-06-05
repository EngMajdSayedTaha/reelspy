"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

type FeedPaginationProps = {
  page: number;
  totalPages: number;
  total: number;
  perPage: number;
};

export function FeedPagination({ page, totalPages, total, perPage }: FeedPaginationProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  if (total === 0) return null;

  function goTo(target: number) {
    const next = new URLSearchParams(searchParams.toString());
    if (target <= 1) {
      next.delete("page");
    } else {
      next.set("page", String(target));
    }
    const query = next.toString();
    startTransition(() => {
      router.push(query ? `${pathname}?${query}` : pathname);
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  }

  const from = (page - 1) * perPage + 1;
  const toShown = Math.min(page * perPage, total);

  // Compact page window around the current page.
  const pages: number[] = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, page + 2);
  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
      <p className="text-xs text-zinc-500">
        Showing {from}–{toShown} of {total}
      </p>

      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={page <= 1 || isPending}
          onClick={() => goTo(page - 1)}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#262626] bg-[#141414] text-zinc-300 transition hover:border-[#F9E400]/60 hover:text-[#F9E400] disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {start > 1 ? (
          <>
            <PageButton n={1} current={page} onClick={goTo} disabled={isPending} />
            {start > 2 ? <span className="px-1 text-zinc-600">…</span> : null}
          </>
        ) : null}

        {pages.map((n) => (
          <PageButton key={n} n={n} current={page} onClick={goTo} disabled={isPending} />
        ))}

        {end < totalPages ? (
          <>
            {end < totalPages - 1 ? <span className="px-1 text-zinc-600">…</span> : null}
            <PageButton n={totalPages} current={page} onClick={goTo} disabled={isPending} />
          </>
        ) : null}

        <button
          type="button"
          disabled={page >= totalPages || isPending}
          onClick={() => goTo(page + 1)}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#262626] bg-[#141414] text-zinc-300 transition hover:border-[#F9E400]/60 hover:text-[#F9E400] disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function PageButton({
  n,
  current,
  onClick,
  disabled,
}: {
  n: number;
  current: number;
  onClick: (n: number) => void;
  disabled: boolean;
}) {
  const active = n === current;
  return (
    <button
      type="button"
      disabled={disabled || active}
      onClick={() => onClick(n)}
      className={
        active
          ? "h-8 min-w-8 rounded-lg bg-[#F9E400] px-2 text-sm font-semibold text-[#121212]"
          : "h-8 min-w-8 rounded-lg border border-[#262626] bg-[#141414] px-2 text-sm text-zinc-300 transition hover:border-[#F9E400]/60 hover:text-[#F9E400] disabled:opacity-40"
      }
    >
      {n}
    </button>
  );
}
