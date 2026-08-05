// Release dictionary domain: the "What's new" page, the one-time update dialog
// and the version pill in the sidebar. Only the CHROME lives here — the release
// notes themselves carry their own en/ar text in lib/release/releases.ts, since
// they are data that changes every release rather than fixed interface copy.
// Composed into the root `Dict` by lib/i18n/dictionaries/index.ts.

const en = {
  release: {
    // Sidebar pill + nav
    versionLabel: (version: string) => `Version ${version}`,
    versionShort: (version: string) => `v${version}`,
    whatsNew: "What's new",
    unseenBadge: "New update",

    // /dashboard/whats-new
    heading: "What's new",
    subheading: "Everything we've added, improved and fixed — in plain language.",
    currentBadge: "You're on this version",
    releasedOn: "Released",
    empty: "No release notes yet. Check back after the next update.",

    // Change categories
    kinds: {
      new: "New",
      improved: "Improved",
      fixed: "Fixed",
    },

    // One-time dialog
    dialog: {
      eyebrow: "Just updated",
      title: (title: string) => title,
      seeAll: "See all updates",
      dismiss: "Got it",
    },
  },
};

export type ReleaseDict = typeof en;
export const releaseEn = en;

export const releaseAr: ReleaseDict = {
  release: {
    versionLabel: (version: string) => `الإصدار ${version}`,
    versionShort: (version: string) => `v${version}`,
    whatsNew: "ما الجديد",
    unseenBadge: "تحديث جديد",

    heading: "ما الجديد",
    subheading: "كل ما أضفناه وحسّناه وأصلحناه — بلغة بسيطة.",
    currentBadge: "أنت على هذا الإصدار",
    releasedOn: "صدر في",
    empty: "لا توجد ملاحظات إصدار بعد. عد إلينا بعد التحديث القادم.",

    kinds: {
      new: "جديد",
      improved: "تحسين",
      fixed: "إصلاح",
    },

    dialog: {
      eyebrow: "تم التحديث للتو",
      title: (title: string) => title,
      seeAll: "عرض كل التحديثات",
      dismiss: "حسنًا",
    },
  },
};
