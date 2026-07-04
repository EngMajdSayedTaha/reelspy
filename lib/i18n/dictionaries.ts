// Shell translation dictionaries (roadmap X1). Foundation scope: the app chrome
// (sidebar nav, top-bar titles, common shell strings) so the shell renders
// end-to-end in Arabic and the pattern is established. Page-body copy is
// translated incrementally on top of this — add keys here and consume them via
// `getDictionary(locale)` (server) or the `dict` prop threaded through the
// dashboard shell (client). Every locale must define every key (typed by `Dict`
// = the shape of the English dictionary), so a missing translation is a compile
// error, not a silent English fallback.

import type { Locale } from "@/lib/i18n/config";

const en = {
  nav: {
    dashboard: "Dashboard",
    accounts: "Accounts",
    feed: "Feed",
    hooks: "Hooks",
    scripts: "Scripts",
    myIg: "My IG",
    autoReply: "Auto-Reply",
    publishing: "Publishing",
    calendar: "Calendar",
    connections: "Connections",
    billing: "Billing",
    settings: "Settings",
  },
  titles: {
    dashboard: "Dashboard",
    accounts: "Inspiration Accounts",
    feed: "Feed",
    hooks: "Hook Library",
    generate: "Script Generator",
    scripts: "Scripts Library",
    myAccount: "My Instagram",
    automations: "Auto-Reply",
    publishing: "Publishing",
    calendar: "Content Calendar",
    connections: "Connections",
    billing: "Billing",
    settings: "Settings",
  },
  shell: {
    plan: "Plan",
    connected: "Connected",
    notConnected: "Not connected",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    signOut: "Sign out",
  },
  prefs: {
    language: "Language",
    languageHint: "Interface language and text direction.",
  },
};

// The English dictionary defines the required shape (keys fixed, values string);
// other locales must match it, so a missing key is a compile error.
export type Dict = typeof en;

const ar: Dict = {
  nav: {
    dashboard: "الرئيسية",
    accounts: "الحسابات",
    feed: "المحتوى",
    hooks: "الجمل الافتتاحية",
    scripts: "النصوص",
    myIg: "حسابي",
    autoReply: "الرد الآلي",
    publishing: "النشر",
    calendar: "التقويم",
    connections: "الربط",
    billing: "الاشتراك",
    settings: "الإعدادات",
  },
  titles: {
    dashboard: "الرئيسية",
    accounts: "حسابات الإلهام",
    feed: "المحتوى",
    hooks: "مكتبة الجمل الافتتاحية",
    generate: "منشئ النصوص",
    scripts: "مكتبة النصوص",
    myAccount: "إنستغرامي",
    automations: "الرد الآلي",
    publishing: "النشر",
    calendar: "تقويم المحتوى",
    connections: "الربط",
    billing: "الاشتراك",
    settings: "الإعدادات",
  },
  shell: {
    plan: "الباقة",
    connected: "متصل",
    notConnected: "غير متصل",
    openMenu: "فتح القائمة",
    closeMenu: "إغلاق القائمة",
    signOut: "تسجيل الخروج",
  },
  prefs: {
    language: "اللغة",
    languageHint: "لغة الواجهة واتجاه النص.",
  },
};

const DICTIONARIES: Record<Locale, Dict> = { en, ar };

export function getDictionary(locale: Locale): Dict {
  return DICTIONARIES[locale] ?? en;
}
