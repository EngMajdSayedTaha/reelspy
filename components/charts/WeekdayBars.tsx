"use client";

/**
 * Weekday bar chart — "when does this account perform best?".
 *
 * Generalized out of `InsightsCharts.BestDayChart`. The caller now supplies the
 * already-bucketed values, which lets the account dossier feed it *medians*
 * instead of averages: one viral Tuesday should not crown Tuesday.
 *
 * `values`, `counts` and `labels` are all Monday-first (index 0 = Monday), the
 * remap being `(date.getDay() + 6) % 7`.
 */
export function WeekdayBars({
  values,
  counts,
  labels,
  format,
  tooltip,
  footnote,
  /**
   * Days with fewer than this many posts are drawn dimmed and are never picked
   * as "best" — a single post is not a pattern. 0 disables the rule.
   */
  minSample = 0,
}: {
  values: number[];
  counts: number[];
  labels: string[];
  format: (value: number) => string;
  tooltip: (label: string, value: string, count: number) => string;
  footnote?: (bestIndex: number) => React.ReactNode;
  minSample?: number;
}) {
  const max = Math.max(1, ...values);
  const eligible = values.map((v, i) => (counts[i] >= minSample && v > 0 ? v : -1));
  const bestIdx = eligible.reduce((best, v, i) => (v > eligible[best] ? i : best), 0);
  const hasBest = eligible[bestIdx] > 0;

  if (values.every((v) => v === 0)) return null;

  return (
    <div>
      <div className="flex h-36 items-end gap-2">
        {values.map((v, i) => {
          const isBest = hasBest && i === bestIdx;
          const lowSample = counts[i] < minSample;
          return (
            <div key={labels[i]} className="group flex flex-1 flex-col items-center gap-1">
              <span
                className={`text-[10px] tabular-nums transition-opacity ${
                  isBest ? "text-brand" : "text-subtle opacity-0 group-hover:opacity-100"
                }`}
              >
                {v > 0 ? format(v) : ""}
              </span>
              <div
                className={`w-full rounded-t-md transition-colors ${
                  isBest ? "bg-primary" : "bg-border-strong group-hover:bg-border-strong"
                } ${lowSample ? "opacity-40" : ""}`}
                style={{ height: `${Math.max((v / max) * 100, v > 0 ? 4 : 1)}%` }}
                title={tooltip(labels[i], format(v), counts[i])}
              />
              <span className={`text-[10px] ${isBest ? "font-semibold text-brand" : "text-subtle"}`}>
                {labels[i]}
              </span>
            </div>
          );
        })}
      </div>
      {footnote && hasBest ? (
        <p className="mt-2 text-[11px] text-subtle">{footnote(bestIdx)}</p>
      ) : null}
    </div>
  );
}
