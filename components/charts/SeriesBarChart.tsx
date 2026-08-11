"use client";

import { useState } from "react";
import { ChartTooltip } from "@/components/charts/primitives";

export type SeriesPoint = {
  /** Stable React key. */
  id: string;
  value: number;
  /** Opened in a new tab when the bar is clicked. */
  href?: string | null;
};

/**
 * Interactive bar chart of one series, with an average reference line and a
 * hover tooltip the caller renders.
 *
 * Generalized out of `InsightsCharts.MetricBarChart`, which read straight off
 * `MediaItem`. Tracked third-party accounts have no `insights` object at all —
 * only views/likes/comments — so the data shape had to become plain numbers.
 */
export function SeriesBarChart({
  points,
  color,
  renderTooltip,
  startLabel,
  centerLabel,
  endLabel,
  className = "h-48",
}: {
  points: SeriesPoint[];
  /** Any valid SVG paint — always a `var(--chart-N)` so it follows the theme. */
  color: string;
  renderTooltip?: (point: SeriesPoint, index: number) => React.ReactNode;
  startLabel?: string;
  centerLabel?: React.ReactNode;
  endLabel?: string;
  className?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);

  if (points.length === 0) return null;

  const max = Math.max(1, ...points.map((p) => p.value));
  const mean = points.reduce((a, p) => a + p.value, 0) / points.length;
  const peakIdx = points.reduce((best, p, i) => (p.value > points[best].value ? i : best), 0);

  const W = 100;
  const H = 42;
  const n = points.length;
  const gap = n > 1 ? 1.5 : 0;
  const barW = (W - gap * (n - 1)) / n;
  const meanY = H - (mean / max) * H;

  return (
    <div className="relative" onMouseLeave={() => setHover(null)}>
      {hover != null && renderTooltip ? (
        <ChartTooltip leftPct={((hover + 0.5) / n) * 100}>
          {renderTooltip(points[hover], hover)}
        </ChartTooltip>
      ) : null}

      <svg viewBox={`0 0 ${W} ${H}`} className={`w-full ${className}`} preserveAspectRatio="none">
        {/* Subtle horizontal gridlines */}
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="var(--chart-grid)" strokeWidth="0.3" />
        ))}
        {/* Average reference line */}
        {mean > 0 ? (
          <line
            x1="0"
            x2={W}
            y1={meanY}
            y2={meanY}
            stroke="var(--chart-axis)"
            strokeWidth="0.4"
            strokeDasharray="1.5 1.5"
          />
        ) : null}
        {points.map((p, i) => {
          const h = (p.value / max) * H;
          const x = i * (barW + gap);
          const isPeak = i === peakIdx && p.value > 0;
          const dimmed = hover != null && hover !== i;
          return (
            <g key={p.id}>
              <rect
                x={x}
                y={H - h}
                width={barW}
                height={Math.max(h, 0.4)}
                rx={barW > 3 ? 0.8 : 0.3}
                fill={isPeak ? color : "var(--chart-dim)"}
                opacity={dimmed ? 0.35 : 1}
                className="transition-opacity"
              />
              {/* Full-height invisible hit area so hovering is easy */}
              <rect
                x={x - gap / 2}
                y="0"
                width={barW + gap}
                height={H}
                fill="transparent"
                className={p.href ? "cursor-pointer" : undefined}
                onMouseEnter={() => setHover(i)}
                onClick={() => {
                  if (p.href) window.open(p.href, "_blank", "noopener");
                }}
              />
            </g>
          );
        })}
      </svg>
      {startLabel || centerLabel || endLabel ? (
        <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-subtle">
          <span>{startLabel}</span>
          <span className="text-subtle">{centerLabel}</span>
          <span>{endLabel}</span>
        </div>
      ) : null}
    </div>
  );
}
