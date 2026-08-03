// How deep a full-history archive walks. Shared by the API (which turns a range
// into a cutoff) and the accounts UI (which offers the choice), so the two can
// never drift apart on what "12m" means.
//
// Range is the real cost control: Business Discovery is paged newest-first, so a
// cutoff is the only thing that decides how many calls an archive spends. A reel
// count can't — the pages come in whatever mix of formats the account posts.

export const ARCHIVE_RANGES = ["6m", "12m", "24m", "all"] as const;

export type ArchiveRange = (typeof ARCHIVE_RANGES)[number];

export const DEFAULT_ARCHIVE_RANGE: ArchiveRange = "12m";

const MONTHS: Record<Exclude<ArchiveRange, "all">, number> = {
  "6m": 6,
  "12m": 12,
  "24m": 24,
};

export function isArchiveRange(value: unknown): value is ArchiveRange {
  return typeof value === "string" && (ARCHIVE_RANGES as readonly string[]).includes(value);
}

// The cutoff instant for a range, or null for "everything" (walk until Meta runs
// out of history).
export function sinceForRange(range: ArchiveRange, now: Date = new Date()): string | null {
  if (range === "all") return null;
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - MONTHS[range]);
  return cutoff.toISOString();
}

// Which of two cutoffs reaches further back. null means "everything" and always
// wins. Used to merge concurrent requests for the same account: two users asking
// for different depths share ONE walk, and it has to be the deeper of the two or
// the shallower request would silently cap the other.
export function deeperSince(a: string | null, b: string | null): string | null {
  if (a == null || b == null) return null;
  return new Date(a).getTime() <= new Date(b).getTime() ? a : b;
}
