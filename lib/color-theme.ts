// Preset color themes. Orthogonal to light/dark (next-themes): the preset is a
// `data-theme` attribute on <html> whose CSS block in globals.css overrides the
// accent tokens (--primary/--ring/--brand/--chart-1) for both modes. Stored in
// its own plain cookie (not reelspy_prefs — savePreferences rebuilds that whole
// cookie from FormData and would silently reset the theme) so the server can
// stamp <html data-theme> with zero flash; profiles.color_theme is the
// cross-device source of truth.

export const COLOR_THEMES = [
  "volt",
  "rose",
  "ocean",
  "violet",
  "emerald",
  "sunset",
  "mono",
  "cyan",
] as const;

export type ColorTheme = (typeof COLOR_THEMES)[number];

export const DEFAULT_COLOR_THEME: ColorTheme = "volt";

export const THEME_COOKIE = "reelspy_theme";

// Tolerant parse: anything unknown falls back to the default (volt), which has
// no CSS override block — the base :root/.dark palette IS volt.
export function normalizeColorTheme(value: unknown): ColorTheme {
  return (COLOR_THEMES as readonly unknown[]).includes(value)
    ? (value as ColorTheme)
    : DEFAULT_COLOR_THEME;
}

// Primary fill + its readable foreground per mode, for the picker's preview
// swatches only. Non-active presets can't be read from CSS variables (only the
// active preset's tokens are live), so these hexes are duplicated from
// globals.css.
type Swatch = { bg: string; fg: string };

export const THEME_SWATCHES: Record<ColorTheme, { light: Swatch; dark: Swatch }> = {
  volt: {
    light: { bg: "#f9e400", fg: "#121212" },
    dark: { bg: "#f9e400", fg: "#121212" },
  },
  rose: {
    light: { bg: "#e11d48", fg: "#ffffff" },
    dark: { bg: "#e11d48", fg: "#ffffff" },
  },
  ocean: {
    light: { bg: "#0369a1", fg: "#ffffff" },
    dark: { bg: "#38bdf8", fg: "#0d0d0d" },
  },
  violet: {
    light: { bg: "#7c3aed", fg: "#ffffff" },
    dark: { bg: "#a78bfa", fg: "#121212" },
  },
  emerald: {
    light: { bg: "#047857", fg: "#ffffff" },
    dark: { bg: "#34d399", fg: "#052e16" },
  },
  sunset: {
    light: { bg: "#c2410c", fg: "#ffffff" },
    dark: { bg: "#fb923c", fg: "#121212" },
  },
  mono: {
    light: { bg: "#18181b", fg: "#ffffff" },
    dark: { bg: "#f4f4f5", fg: "#121212" },
  },
  cyan: {
    light: { bg: "#0e7490", fg: "#ffffff" },
    dark: { bg: "#22d3ee", fg: "#0d0d0d" },
  },
};

// Client-side apply: flips the attribute for an instant repaint and mirrors
// the choice into the cookie so the next SSR render stamps it (no flash).
export function applyColorTheme(theme: ColorTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (theme === DEFAULT_COLOR_THEME) {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = theme;
  }
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax`;
}
