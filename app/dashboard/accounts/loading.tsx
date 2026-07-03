import { Skeleton } from "@/components/ui/skeleton";

// Mirrors the Accounts page: header, add-account form, then the card grid.
export default function AccountsLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-4 w-80" />
      </div>

      {/* Add-account form */}
      <Skeleton className="h-16 w-full rounded-xl" />

      {/* Filter row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-9 w-56 rounded-lg" />
        <Skeleton className="h-9 w-48 rounded-lg" />
      </div>

      {/* Account cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
            <Skeleton className="h-9 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
