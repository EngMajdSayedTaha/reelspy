"use client";

/**
 * Minimal line-and-fill chart for a single series.
 *
 * Nulls are not accepted: a gap in a daily series (a missed cron run) must draw
 * a straight line between the real points around it, never dip to zero. Callers
 * filter first, so what arrives here is always real observations.
 */
export function Sparkline({
  values,
  color = "var(--chart-1)",
  className = "h-24",
  gradientId,
}: {
  values: number[];
  color?: string;
  className?: string;
  /** Must be unique per page — SVG gradient ids are document-global. */
  gradientId: string;
}) {
  if (values.length < 2) return null;

  const W = 100;
  const H = 34;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;

  const points = values.map((v, i) => ({
    x: (i / (values.length - 1)) * W,
    // 5% padding top and bottom so the extremes aren't clipped by the viewBox.
    y: H - ((v - min) / range) * H * 0.9 - H * 0.05,
  }));

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`w-full ${className}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          {/* stop-color via style: a var() in the presentation attribute is
              flaky across browsers, but always resolves in CSS. */}
          <stop offset="0%" style={{ stopColor: color }} stopOpacity="0.28" />
          <stop offset="100%" style={{ stopColor: color }} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="1"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
