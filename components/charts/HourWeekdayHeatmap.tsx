"use client";

export type HeatmapCell = { weekday: number; hour: number; value: number; count: number };

/**
 * 7×24 heatmap of a metric by weekday and hour.
 *
 * Built from CSS Grid `<div>`s, deliberately. An SVG version would need
 * absolute x-coordinates per column, which do not flip under `dir="rtl"` — the
 * grid does, so the Arabic layout reads right-to-left without a second
 * code path. Labels stay in HTML for the same reason: SVG `<text>` does not
 * inherit `dir`.
 *
 * Intensity uses `color-mix` against `--chart-1` so the whole grid re-colors
 * with the active theme preset and stays legible in light and dark.
 */
export function HourWeekdayHeatmap({
  cells,
  dayLabels,
  hourLabel,
  cellTitle,
}: {
  cells: HeatmapCell[];
  /** Monday-first, length 7. */
  dayLabels: string[];
  hourLabel: (hour: number) => string;
  cellTitle: (cell: HeatmapCell, dayLabel: string, hourLabel: string) => string;
}) {
  const max = Math.max(1, ...cells.map((c) => c.value));

  const byKey = new Map(cells.map((c) => [`${c.weekday}:${c.hour}`, c]));

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[520px]">
        {/* Hour ruler — every third hour, so the labels never collide. */}
        <div
          className="mb-1 grid gap-0.5 ps-9 text-[9px] text-subtle"
          style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}
        >
          {Array.from({ length: 24 }, (_, hour) => (
            <span key={hour} className="text-center">
              {hour % 3 === 0 ? hourLabel(hour) : ""}
            </span>
          ))}
        </div>

        <div className="space-y-0.5">
          {dayLabels.map((label, weekday) => (
            <div key={label} className="flex items-center gap-1">
              <span className="w-8 shrink-0 text-[10px] text-subtle">{label}</span>
              <div
                className="grid flex-1 gap-0.5"
                style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}
              >
                {Array.from({ length: 24 }, (_, hour) => {
                  const cell = byKey.get(`${weekday}:${hour}`) ?? {
                    weekday,
                    hour,
                    value: 0,
                    count: 0,
                  };
                  // Floor the non-empty intensity so a single low-view post is
                  // still visibly distinct from "they never post at this hour".
                  const pct = cell.count === 0 ? 0 : Math.max(14, (cell.value / max) * 100);
                  return (
                    <div
                      key={hour}
                      title={cellTitle(cell, label, hourLabel(hour))}
                      className="aspect-square rounded-[3px] border border-border/40"
                      style={{
                        background:
                          pct === 0
                            ? "var(--chart-grid)"
                            : `color-mix(in oklab, var(--chart-1) ${pct.toFixed(0)}%, transparent)`,
                      }}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
