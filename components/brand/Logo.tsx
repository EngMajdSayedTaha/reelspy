// ReelSpy unified brand mark: a spy viewfinder locked onto a play button, with
// a scanning beam sweeping through — "watching reels so you don't have to".
// The mark uses FIXED brand colors (volt-yellow gradient tile + ink glyphs) so
// the logo is identical everywhere — in-app, favicon (app/icon.svg), and the
// PNG exports in public/brand — regardless of the user's color-theme preset.
// If the geometry or colors change, update app/icon.svg and regenerate the
// PNGs (scripts/generate-brand-assets.mjs) to keep them in sync.

const INK = "#121212";

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
      <defs>
        {/* Shared ids across instances resolve to the first identical def — safe. */}
        <linearGradient id="rsBg" x1="0" y1="0" x2="0" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFEE55" />
          <stop offset="0.55" stopColor="#F9E400" />
          <stop offset="1" stopColor="#EBCB00" />
        </linearGradient>
        <linearGradient id="rsSheen" x1="0" y1="0" x2="0" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.5" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
      </defs>

      <rect width="64" height="64" rx="14" fill="url(#rsBg)" />
      <rect x="1" y="1" width="62" height="62" rx="13" fill="url(#rsSheen)" opacity="0.55" />
      <rect x="0.5" y="0.5" width="63" height="63" rx="13.5" stroke={INK} strokeOpacity="0.12" />

      {/* Viewfinder corner brackets */}
      <g
        stroke={INK}
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
        fill={INK}
        stroke={INK}
        strokeWidth="3"
        strokeLinejoin="round"
        className={animated ? "logo-play" : undefined}
        style={{ transformOrigin: "33px 32px" }}
      />

      {/* Scanning beam */}
      {animated ? (
        <rect x="13" y="31" width="38" height="2.5" rx="1.25" fill={INK} opacity="0.8" className="logo-scan" />
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
