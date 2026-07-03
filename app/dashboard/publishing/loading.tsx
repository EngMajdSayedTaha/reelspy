import { Skeleton } from "@/components/ui/skeleton";

// Mirrors the Publishing page: header, composer block, then recent-posts list.
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

      {/* Composer */}
      <Skeleton className="h-64 w-full rounded-xl" />

      {/* Recent posts */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-32" />
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
