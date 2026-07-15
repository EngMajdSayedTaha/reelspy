// Theme dictionary domain: the light/dark/system toggle (`components/theme/
// ThemeToggle.tsx`) and the preset color-theme picker (`components/settings/
// ThemePicker.tsx`) — small enough to not belong in any single feature area,
// but not part of the protected `shell.ts`/`common.ts` files either. Composed
// into the root `Dict` by `lib/i18n/dictionaries/index.ts`.

const en = {
  theme: {
    colorTheme: "Color theme",
    light: "Light",
    dark: "Dark",
    system: "System",
    picker: {
      title: "Accent color",
      description:
        "Pick a color pair: the main color drives buttons and links, its paired accent drives charts and highlights.",
      savedToast: "Theme saved",
      saveError: "Couldn't save your theme. Please try again.",
    },
    presets: {
      volt: "Volt",
      rose: "Rosé",
      ocean: "Ocean",
      violet: "Violet",
      emerald: "Emerald",
      sunset: "Sunset",
      mono: "Mono",
      cyan: "Cyan",
    },
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
    picker: {
      title: "لون التمييز",
      description:
        "اختر زوجًا من الألوان: اللون الرئيسي للأزرار والروابط، واللون المرافق للرسوم البيانية والعناصر البارزة.",
      savedToast: "تم حفظ السمة",
      saveError: "تعذّر حفظ السمة. حاول مرة أخرى.",
    },
    presets: {
      volt: "فولت",
      rose: "وردي",
      ocean: "محيطي",
      violet: "بنفسجي",
      emerald: "زمردي",
      sunset: "غروب",
      mono: "أحادي",
      cyan: "سماوي",
    },
  },
};
