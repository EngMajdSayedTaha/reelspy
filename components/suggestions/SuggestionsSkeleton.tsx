// Suspense fallback for SuggestedAccountsSection — the cross-user aggregate
// query streams in independently, so callers show this instead of blocking.
export function SuggestionsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="grid animate-pulse gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-20 rounded-xl border border-border bg-card" />
      ))}
    </div>
  );
}
