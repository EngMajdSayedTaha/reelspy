// Settings dictionary domain: /dashboard/settings page, actions, and its
// PreferencesForm / DigestToggle / DangerZone components. Composed into the
// root `Dict` by `lib/i18n/dictionaries/index.ts`.
//
// Arabic note: `secondsLabel`/`reelsPerAccountLabel`/`reelsPerPageLabel` use a
// single invariant plural noun form regardless of the count (the common,
// widely-accepted simplification in modern software Arabic UI) rather than
// full classical number-noun agreement (which would need a different noun
// form for 3-10 vs 11+ vs exactly 1/2) — flagged in the handoff report.

const en = {
  settings: {
    heading: "Settings",
    subheading: "Tune how the app behaves for you.",
    socialConnections: {
      title: "Social connections",
      description: "Connect & manage Instagram, Facebook, TikTok and YouTube.",
      manage: "Manage",
    },
    preferences: {
      title: "Preferences",
      subtitle: "Tune how the app behaves for you. Saved on this device.",
      notificationDuration: "Notification duration",
      notificationDurationHint: "How long toasts stay on screen.",
      secondsLabel: (n: number) => `${n} seconds`,
      defaultSyncDepth: "Default sync depth",
      defaultSyncDepthHint: "Pre-selected on sync buttons.",
      reelsPerAccountLabel: (n: number) => `${n} reels per account`,
      feedPageSize: "Feed page size",
      feedPageSizeHint: "Default page size in the Feed.",
      reelsPerPageLabel: (n: number) => `${n} reels per page`,
      save: "Save preferences",
      saved: "Preferences saved",
      saveError: "Could not save preferences.",
    },
    digest: {
      title: "Weekly digest",
      description:
        "A weekly email with what's rising in your niche, hooks to reuse, and your loop nudge.",
      toggleAriaLabel: "Toggle weekly digest email",
      onToast: "Weekly digest on",
      offToast: "Weekly digest off",
      updateError: "Could not update your preference",
    },
    danger: {
      title: "Data & privacy",
      description: "Download a copy of your data, or permanently delete your account.",
      exportTitle: "Export my data",
      exportDescription:
        "A JSON file with your profile, accounts, reels, scripts, automations, and events.",
      deleteTitle: "Delete account",
      deleteDescription: "Removes your profile and all associated data. This cannot be undone.",
      deleteButton: "Delete account",
      deleteDialogTitle: "Delete your account?",
      deleteWarning:
        "This permanently deletes your profile, tracked accounts, reels, scripts, automations, uploaded videos, and event history, and revokes any connected Instagram access. This ",
      deleteWarningEmphasis: "cannot be undone",
      typeConfirmPrefix: "Type",
      typeConfirmSuffix: "to confirm",
      deletePermanently: "Delete permanently",
      deleteSuccess: "Your account has been deleted.",
      couldNotDelete: "Could not delete your account.",
    },
  },
};

export type SettingsDict = typeof en;
export const settingsEn = en;

export const settingsAr: SettingsDict = {
  settings: {
    heading: "الإعدادات",
    subheading: "اضبط سلوك التطبيق بما يناسبك.",
    socialConnections: {
      title: "حسابات التواصل الاجتماعي",
      description: "اربط وأدر حسابات إنستغرام وفيسبوك وتيك توك ويوتيوب.",
      manage: "إدارة",
    },
    preferences: {
      title: "التفضيلات",
      subtitle: "اضبط سلوك التطبيق بما يناسبك. يُحفظ على هذا الجهاز.",
      notificationDuration: "مدة الإشعارات",
      notificationDurationHint: "المدة التي تبقى فيها الإشعارات المنبثقة على الشاشة.",
      secondsLabel: (n: number) => `${n} ثوانٍ`,
      defaultSyncDepth: "عمق المزامنة الافتراضي",
      defaultSyncDepthHint: "القيمة المحددة مسبقًا في أزرار المزامنة.",
      reelsPerAccountLabel: (n: number) => `${n} ريلز لكل حساب`,
      feedPageSize: "حجم صفحة المحتوى",
      feedPageSizeHint: "الحجم الافتراضي للصفحة في المحتوى.",
      reelsPerPageLabel: (n: number) => `${n} ريلز لكل صفحة`,
      save: "حفظ التفضيلات",
      saved: "تم حفظ التفضيلات",
      saveError: "تعذّر حفظ التفضيلات.",
    },
    digest: {
      title: "الملخص الأسبوعي",
      description: "رسالة أسبوعية بأبرز ما يرتفع في مجالك، وجُمل افتتاحية لإعادة استخدامها، وتذكير بمهامك.",
      toggleAriaLabel: "تبديل رسالة الملخص الأسبوعي",
      onToast: "تم تفعيل الملخص الأسبوعي",
      offToast: "تم إيقاف الملخص الأسبوعي",
      updateError: "تعذّر تحديث تفضيلك",
    },
    danger: {
      title: "البيانات والخصوصية",
      description: "نزّل نسخة من بياناتك، أو احذف حسابك نهائيًا.",
      exportTitle: "تصدير بياناتي",
      exportDescription: "ملف JSON يضم ملفك الشخصي، والحسابات، والريلز، والنصوص، والأتمتة، والأحداث.",
      deleteTitle: "حذف الحساب",
      deleteDescription: "يزيل ملفك الشخصي وجميع البيانات المرتبطة به. لا يمكن التراجع عن هذا الإجراء.",
      deleteButton: "حذف الحساب",
      deleteDialogTitle: "هل تريد حذف حسابك؟",
      deleteWarning:
        "سيؤدي هذا إلى حذف ملفك الشخصي نهائيًا، وجميع الحسابات المتابَعة، والريلز، والنصوص، والأتمتة، والفيديوهات المرفوعة، وسجل الأحداث، كما سيُلغى أي وصول متصل بإنستغرام. هذا الإجراء ",
      deleteWarningEmphasis: "لا يمكن التراجع عنه",
      typeConfirmPrefix: "اكتب",
      typeConfirmSuffix: "للتأكيد",
      deletePermanently: "حذف نهائيًا",
      deleteSuccess: "تم حذف حسابك.",
      couldNotDelete: "تعذّر حذف حسابك.",
    },
  },
};
