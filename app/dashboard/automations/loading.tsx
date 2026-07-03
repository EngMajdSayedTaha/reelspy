import { Skeleton } from "@/components/ui/skeleton";

// Mirrors the Auto-Reply page: header, platform tabs, form, then card grid.
export default function AutomationsLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-96" />
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-32 rounded-lg" />
        ))}
      </div>

      {/* Form */}
      <Skeleton className="h-40 w-full rounded-xl" />

      {/* Automation cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-2xl border border-border bg-card p-4">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-9 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
