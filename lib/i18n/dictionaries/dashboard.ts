// Dashboard home/overview page dictionary domain (`app/dashboard/page.tsx`).
// Composed into the root `Dict` by `lib/i18n/dictionaries/index.ts`.

const en = {
  dashboard: {
    welcomeBack: (name: string) => `Welcome back, ${name}`,
    subheading: "Your content intelligence command center.",
    fallbackName: "creator",
    stats: {
      inspirationAccounts: "Inspiration Accounts",
      trackedReels: "Tracked Reels",
      scriptsGenerated: "Scripts Generated",
      postsPublished: "Posts Published",
      reelsWorkedOn: "Reels Worked On",
      favorites: "Favorites",
      scheduledScripts: "Scheduled Scripts",
    },
    quickActions: {
      heading: "Quick actions",
      addAccounts: { title: "Add accounts", desc: "Track new creators" },
      syncFeed: { title: "Sync feed", desc: "Pull the latest reels" },
      writeScript: { title: "Write a script", desc: "Turn ideas into content" },
    },
  },
};

export type DashboardDict = typeof en;
export const dashboardEn = en;

export const dashboardAr: DashboardDict = {
  dashboard: {
    welcomeBack: (name: string) => `أهلًا بعودتك، ${name}`,
    subheading: "مركز قيادة استخبارات المحتوى الخاص بك.",
    fallbackName: "صانع المحتوى",
    stats: {
      inspirationAccounts: "حسابات الإلهام",
      trackedReels: "الريلز المتابَعة",
      scriptsGenerated: "النصوص المُنشأة",
      postsPublished: "المنشورات المنشورة",
      reelsWorkedOn: "الريلز المُنجزة",
      favorites: "المفضّلة",
      scheduledScripts: "النصوص المجدولة",
    },
    quickActions: {
      heading: "إجراءات سريعة",
      addAccounts: { title: "إضافة حسابات", desc: "تابع صنّاع محتوى جددًا" },
      syncFeed: { title: "مزامنة المحتوى", desc: "اسحب أحدث الريلز" },
      writeScript: { title: "كتابة نص", desc: "حوّل أفكارك إلى محتوى" },
    },
  },
};
