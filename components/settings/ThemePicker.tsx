"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { useTheme } from "next-themes";
import { Palette, Check } from "lucide-react";
import { toast } from "sonner";
import { setColorTheme } from "@/app/dashboard/settings/actions";
import {
  COLOR_THEMES,
  THEME_SWATCHES,
  applyColorTheme,
  normalizeColorTheme,
  type ColorTheme,
} from "@/lib/color-theme";
import { useDict } from "@/lib/i18n/I18nProvider";

// Preset color-theme picker (Settings → Appearance). Optimistic like
// DigestToggle: the attribute flips instantly via applyColorTheme, then the
// server action persists to profiles.color_theme; on failure we roll back.
export function ThemePicker({ initialTheme }: { initialTheme: string | null | undefined }) {
  const dict = useDict();
  const t = dict.theme;
  const { resolvedTheme } = useTheme();
  const [selected, setSelected] = useState<ColorTheme>(normalizeColorTheme(initialTheme));
  const [pending, startTransition] = useTransition();

  // next-themes resolves only after mount; render dark swatches (the app
  // default) until then so SSR and first client render agree. The
  // useSyncExternalStore snapshot pair is the hydration detector: server
  // snapshot false, client snapshot true, no re-subscription ever fires.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const mode = mounted && resolvedTheme === "light" ? "light" : "dark";

  const choose = (next: ColorTheme) => {
    if (next === selected) return;
    const previous = selected;
    setSelected(next);
    applyColorTheme(next);
    startTransition(async () => {
      try {
        await setColorTheme(next);
        toast.success(t.picker.savedToast);
      } catch {
        setSelected(previous);
        applyColorTheme(previous);
        toast.error(t.picker.saveError);
      }
    });
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary ring-1 ring-border-strong">
          <Palette className="h-5 w-5 text-brand" />
        </span>
        <div>
          <p className="font-semibold text-foreground">{t.picker.title}</p>
          <p className="text-xs text-muted-foreground">{t.picker.description}</p>
        </div>
      </div>

      <div
        role="radiogroup"
        aria-label={t.picker.title}
        className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-8"
      >
        {COLOR_THEMES.map((preset) => {
          const active = preset === selected;
          const swatch = THEME_SWATCHES[preset][mode];
          return (
            <button
              key={preset}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={pending}
              onClick={() => choose(preset)}
              className={`flex flex-col items-center gap-1.5 rounded-xl border p-2.5 transition disabled:opacity-50 ${
                active
                  ? "border-transparent ring-2 ring-ring bg-secondary"
                  : "border-border hover:border-border-strong"
              }`}
            >
              <span
                className="relative flex h-7 w-7 items-center justify-center rounded-full ring-1 ring-border-strong"
                style={{
                  background: `linear-gradient(135deg, ${swatch.bg} 0 55%, ${swatch.accent} 55% 100%)`,
                }}
              >
                {active && <Check className="h-4 w-4" style={{ color: swatch.fg }} />}
              </span>
              <span
                className={`text-[0.7rem] font-medium ${active ? "text-foreground" : "text-muted-foreground"}`}
              >
                {t.presets[preset]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
