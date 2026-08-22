import { Skeleton } from "@/components/ui/skeleton";

// Mirrors the Publishing page: header, the composer + preview two-column grid,
// then the recent-posts list with its filter chips.
export default function PublishingLoading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Skeleton className="h-10 w-36 rounded-lg" />
      </div>

      {/* Composer + live preview */}
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_300px] md:items-start lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5 rounded-2xl border border-border bg-card p-5">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-20 w-full rounded-xl" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
          <Skeleton className="h-24 w-full" />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-9 w-32 rounded-lg" />
        </div>
        <Skeleton className="hidden aspect-[9/16] w-full max-w-[320px] rounded-[2.6rem] md:block" />
      </div>

      {/* Recent posts */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Skeleton className="h-5 w-32" />
          <div className="flex gap-1.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-16 rounded-full" />
            ))}
          </div>
        </div>
        <ul className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i} className="space-y-3 rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
              <Skeleton className="h-8 w-40 rounded-lg" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
