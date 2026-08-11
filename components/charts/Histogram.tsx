"use client";

export type HistogramBucket = {
  label: string;
  count: number;
  /** Short badge pinned to this bucket, e.g. "median" or "p90". */
  marker?: string | null;
};

/**
 * Distribution of a metric across buckets.
 *
 * Drawn with flex `<div>`s rather than SVG `<rect>` coordinates so it flips
 * correctly under `dir="rtl"` for free — absolute SVG x-coordinates do not.
 *
 * Markers are attached to the bucket a statistic falls into rather than drawn
 * as a vertical line at an interpolated position: with log-scale buckets a line
 * between two bars implies a precision the bucketing doesn't have, and "the
 * median sits in this bar" is what the reader actually wants to know.
 */
export function Histogram({
  buckets,
  emptyLabel,
}: {
  buckets: HistogramBucket[];
  emptyLabel?: string;
}) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const total = buckets.reduce((a, b) => a + b.count, 0);

  if (total === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="flex h-40 items-end gap-1.5">
      {buckets.map((bucket) => (
        <div key={bucket.label} className="group flex min-w-0 flex-1 flex-col items-center gap-1">
          <span
            className={`text-[10px] tabular-nums transition-opacity ${
              bucket.marker ? "text-brand" : "text-subtle opacity-0 group-hover:opacity-100"
            }`}
          >
            {bucket.count > 0 ? bucket.count : ""}
          </span>
          <div
            className={`w-full rounded-t-md transition-colors ${
              bucket.marker ? "bg-primary" : "bg-border-strong"
            }`}
            style={{ height: `${Math.max((bucket.count / max) * 100, bucket.count > 0 ? 3 : 1)}%` }}
            title={`${bucket.label}: ${bucket.count}`}
          />
          <span className="w-full truncate text-center text-[9px] leading-tight text-subtle">
            {bucket.label}
          </span>
          {bucket.marker ? (
            <span className="rounded-full bg-accent-brand px-1.5 text-[9px] font-medium text-accent-brand-foreground">
              {bucket.marker}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
