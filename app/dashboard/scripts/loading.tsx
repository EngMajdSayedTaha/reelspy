import { Skeleton } from "@/components/ui/skeleton";

// Mirrors the Scripts page: header, generator card, then history list.
export default function ScriptsLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-80" />
      </div>

      {/* Generator card */}
      <div className="space-y-4 rounded-xl border border-border bg-card p-4">
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-20 w-full rounded-lg" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
        <Skeleton className="h-10 w-40 rounded-lg" />
      </div>

      {/* History list */}
      <div className="grid gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-xl border border-border bg-card p-4">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-9 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
