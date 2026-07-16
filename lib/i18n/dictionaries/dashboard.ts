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
    emptyHints: {
      accounts: "Track accounts to get started",
      reels: "Sync to start tracking",
      scripts: "Generate your first script",
      published: "Publish your first post",
    },
    quickActions: {
      heading: "Quick actions",
      addAccounts: { title: "Add accounts", desc: "Track new creators" },
      syncFeed: { title: "Sync feed", desc: "Pull the latest reels" },
      writeScript: { title: "Write a script", desc: "Turn ideas into content" },
    },
    pageTour: {
      steps: {
        checklist: {
          title: "Finish setting up",
          desc: "Pick up where you left off — this card tracks your setup progress.",
        },
        quickActions: {
          title: "Quick actions",
          desc: "The fastest way to add accounts, sync your feed, or write a script.",
        },
        stats: {
          title: "Your stats",
          desc: "Quick counts of accounts, reels, scripts and posts — click any card to jump to that section.",
        },
        suggested: {
          title: "Suggested accounts",
          desc: "Accounts ReelSpy thinks you should track, based on your niche.",
        },
      },
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
    emptyHints: {
      accounts: "تابع حسابات للبدء",
      reels: "زامن لتبدأ المتابعة",
      scripts: "أنشئ أول نص لك",
      published: "انشر أول منشور لك",
    },
    quickActions: {
      heading: "إجراءات سريعة",
      addAccounts: { title: "إضافة حسابات", desc: "تابع صنّاع محتوى جددًا" },
      syncFeed: { title: "مزامنة المحتوى", desc: "اسحب أحدث الريلز" },
      writeScript: { title: "كتابة نص", desc: "حوّل أفكارك إلى محتوى" },
    },
    pageTour: {
      steps: {
        checklist: {
          title: "أكمل الإعداد",
          desc: "تابع من حيث توقفت — تعرض هذه البطاقة تقدّم إعدادك.",
        },
        quickActions: {
          title: "إجراءات سريعة",
          desc: "أسرع طريقة لإضافة حسابات، مزامنة محتواك، أو كتابة نص.",
        },
        stats: {
          title: "إحصاءاتك",
          desc: "عدد سريع للحسابات والريلز والنصوص والمنشورات — اضغط أي بطاقة للانتقال إلى ذلك القسم.",
        },
        suggested: {
          title: "حسابات مقترحة",
          desc: "حسابات يرى ReelSpy أنه يجدر بك تتبعها، بناءً على مجالك.",
        },
      },
    },
  },
};
