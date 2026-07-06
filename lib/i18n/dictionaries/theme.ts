// Theme dictionary domain: the light/dark/system toggle (`components/theme/
// ThemeToggle.tsx`) — small enough to not belong in any single feature area,
// but not part of the protected `shell.ts`/`common.ts` files either. Composed
// into the root `Dict` by `lib/i18n/dictionaries/index.ts`.

const en = {
  theme: {
    colorTheme: "Color theme",
    light: "Light",
    dark: "Dark",
    system: "System",
  },
};

export type ThemeDict = typeof en;
export const themeEn = en;

export const themeAr: ThemeDict = {
  theme: {
    colorTheme: "سمة الألوان",
    light: "فاتح",
    dark: "داكن",
    system: "النظام",
  },
};
