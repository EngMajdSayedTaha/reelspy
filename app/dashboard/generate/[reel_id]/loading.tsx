import { Skeleton } from "@/components/ui/skeleton";

// Mirrors the Generate page: header + two-column (source reel / transcript +
// generator) layout so the sticky reel column doesn't jump on load.
export default function GenerateLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-4 w-72" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[340px_1fr] lg:items-start">
        {/* Source reel */}
        <div className="mx-auto w-full max-w-sm space-y-2 lg:mx-0 lg:max-w-none">
          <Skeleton className="h-3 w-24" />
          <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
            <Skeleton className="aspect-[4/5] w-full rounded-xl" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>

        {/* Transcript panel + generator */}
        <div className="space-y-6">
          <Skeleton className="h-40 w-full rounded-xl" />
          <div className="space-y-4 rounded-xl border border-border bg-card p-4">
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-10 w-40 rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}
