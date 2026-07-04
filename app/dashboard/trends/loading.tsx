// Skeleton for the Niche Radar (X3) — mirrors the header + chip row + card grid.
export default function TrendsLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="space-y-2">
        <div className="h-6 w-40 rounded bg-secondary" />
        <div className="h-4 w-full max-w-2xl rounded bg-secondary/70" />
      </div>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-8 w-24 rounded-full bg-secondary" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="aspect-[9/16] max-h-72 w-full bg-secondary" />
            <div className="space-y-2 p-3">
              <div className="h-4 w-24 rounded bg-secondary" />
              <div className="h-3 w-16 rounded bg-secondary/70" />
              <div className="h-3 w-full rounded bg-secondary/70" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
