// ReelSpy brand mark: a spy viewfinder locked onto a play button, with a
// scanning beam sweeping through — "watching reels so you don't have to".
// Colors follow the active preset (--primary/--primary-foreground) so the
// mark re-colors along with buttons/links when the user picks a theme. The
// favicon in app/icon.svg stays static brand yellow — it's a standalone file
// the browser fetches outside the page's CSS/theme context, so it can't
// follow the in-app preset; keep its silhouette in sync if the design changes.

type LogoMarkProps = {
  size?: number;
  animated?: boolean;
  className?: string;
  ariaLabel?: string;
};

export function LogoMark({ size = 32, animated = true, className, ariaLabel = "ReelSpy logo" }: LogoMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      role="img"
      aria-label={ariaLabel}
      className={className}
    >
      <rect width="64" height="64" rx="14" fill="var(--primary)" />

      {/* Viewfinder corner brackets */}
      <g
        stroke="var(--primary-foreground)"
        strokeWidth="4.5"
        strokeLinecap="round"
        fill="none"
        className={animated ? "logo-focus" : undefined}
        style={{ transformOrigin: "32px 32px" }}
      >
        <path d="M13 23v-4a6 6 0 0 1 6-6h4" />
        <path d="M41 13h4a6 6 0 0 1 6 6v4" />
        <path d="M51 41v4a6 6 0 0 1-6 6h-4" />
        <path d="M23 51h-4a6 6 0 0 1-6-6v-4" />
      </g>

      {/* Play triangle */}
      <path
        d="M27 23.5 L43.5 32 L27 40.5 Z"
        fill="var(--primary-foreground)"
        stroke="var(--primary-foreground)"
        strokeWidth="3"
        strokeLinejoin="round"
        className={animated ? "logo-play" : undefined}
        style={{ transformOrigin: "33px 32px" }}
      />

      {/* Scanning beam */}
      {animated ? (
        <rect x="13" y="31" width="38" height="2.5" rx="1.25" fill="var(--primary-foreground)" className="logo-scan" />
      ) : null}
    </svg>
  );
}

type LogoProps = {
  size?: number;
  animated?: boolean;
  withWordmark?: boolean;
  className?: string;
  ariaLabel?: string;
};

export function Logo({ size = 32, animated = true, withWordmark = true, className, ariaLabel }: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <LogoMark size={size} animated={animated} ariaLabel={ariaLabel} />
      {withWordmark ? (
        <span
          className="font-semibold tracking-tight text-foreground"
          style={{ fontSize: Math.round(size * 0.62) }}
        >
          Reel<span className="text-brand">Spy</span>
        </span>
      ) : null}
    </span>
  );
}
