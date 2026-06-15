"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";

const OPTIONS: { value: string; label: string; icon: LucideIcon }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // next-themes only knows the real theme after mount; render a stable
  // placeholder during SSR/first paint to avoid a hydration mismatch.
  useEffect(() => {
    const markMounted = () => setMounted(true);
    markMounted();
  }, []);

  const active = mounted ? theme ?? "system" : null;

  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      className="flex items-center gap-1 rounded-lg border border-border bg-surface-2 p-1"
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const selected = active === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={`flex h-7 flex-1 items-center justify-center rounded-md transition ${
              selected
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}
