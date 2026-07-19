// ReelSpy unified brand mark: a spy viewfinder locked onto a play button, with
// a scanning beam sweeping through — "watching reels so you don't have to".
// The mark uses FIXED brand colors (graphite intelligence tile + luminous
// electric-yellow "signal" glyphs) so the logo is identical everywhere — in-app,
// favicon (app/icon.svg), and the PNG exports in public/brand — regardless of
// the user's color-theme preset. The yellow is the brand's single accent
// (#f9e400, the volt primary); the tile deliberately stays graphite so the mark
// reads the same on light and dark surfaces.
// If the geometry or colors change, update app/icon.svg and regenerate the
// PNGs (scripts/generate-brand-assets.mjs) to keep them in sync.

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
        <linearGradient id="rsTile" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2A2A31" />
          <stop offset="0.5" stopColor="#17171B" />
          <stop offset="1" stopColor="#0E0E11" />
        </linearGradient>
        <radialGradient id="rsHalo" cx="32" cy="30" r="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#F9E400" stopOpacity="0.35" />
          <stop offset="0.55" stopColor="#EAB308" stopOpacity="0.10" />
          <stop offset="1" stopColor="#EAB308" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="rsGlyph" x1="14" y1="14" x2="52" y2="52" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FEF08A" />
          <stop offset="0.5" stopColor="#F9E400" />
          <stop offset="1" stopColor="#EAB308" />
        </linearGradient>
        <linearGradient id="rsPlay" x1="27" y1="23" x2="44" y2="41" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFFBE0" />
          <stop offset="0.45" stopColor="#FDE047" />
          <stop offset="1" stopColor="#F9E400" />
        </linearGradient>
        <linearGradient id="rsSheen" x1="0" y1="0" x2="0" y2="26" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.10" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <filter id="rsBlur" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3.4" />
        </filter>
      </defs>

      <rect width="64" height="64" rx="14" fill="url(#rsTile)" />
      <rect width="64" height="64" rx="14" fill="url(#rsHalo)" />
      <rect x="1" y="1" width="62" height="62" rx="13" fill="url(#rsSheen)" />
      <rect x="0.75" y="0.75" width="62.5" height="62.5" rx="13.25" stroke="#FFFFFF" strokeOpacity="0.09" strokeWidth="1.5" />

      {/* Soft glow behind the play triangle */}
      <g filter="url(#rsBlur)" opacity="0.75">
        <path d="M27 23.5 L43.5 32 L27 40.5 Z" fill="url(#rsPlay)" stroke="url(#rsPlay)" strokeWidth="3.5" strokeLinejoin="round" />
      </g>

      {/* Viewfinder corner brackets */}
      <g
        stroke="url(#rsGlyph)"
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
        fill="url(#rsPlay)"
        stroke="url(#rsPlay)"
        strokeWidth="3.5"
        strokeLinejoin="round"
        className={animated ? "logo-play" : undefined}
        style={{ transformOrigin: "33px 32px" }}
      />

      {/* Scanning beam */}
      {animated ? (
        <rect x="13" y="31" width="38" height="2.5" rx="1.25" fill="#F9E400" opacity="0.8" className="logo-scan" />
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
