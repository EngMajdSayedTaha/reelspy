"use client";

import { useEffect } from "react";
import {
  DEFAULT_COLOR_THEME,
  applyColorTheme,
  normalizeColorTheme,
  type ColorTheme,
} from "@/lib/color-theme";

/**
 * Reconciles the device with the account's saved color theme. The cookie is
 * device-local, so on a new device (or after clearing cookies) the SSR stamp
 * falls back to the default — this re-applies the DB value and rewrites the
 * cookie so subsequent SSR renders are flash-free. Renders nothing.
 */
export function ColorThemeSync({ dbTheme }: { dbTheme: string | null | undefined }) {
  useEffect(() => {
    if (dbTheme == null) return;
    const wanted: ColorTheme = normalizeColorTheme(dbTheme);
    const current = normalizeColorTheme(
      document.documentElement.dataset.theme ?? DEFAULT_COLOR_THEME,
    );
    if (current !== wanted) applyColorTheme(wanted);
  }, [dbTheme]);

  return null;
}
