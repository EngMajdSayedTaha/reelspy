// Hooks dictionary domain: `/dashboard/hooks` page, and the HooksExplorer /
// SavedHooksLibrary components (the hook library — saved opening lines of
// short-form scripts, pulled from reel transcripts). Composed into the root
// `Dict` by `lib/i18n/dictionaries/index.ts`.
//
// Arabic note: dynamic-count strings use a single invariant plural noun
// regardless of the count, matching the simplification used elsewhere in
// this codebase's Arabic strings.

const en = {
  hooks: {
    page: {
      title: "Hook Library",
      subtitle:
        "Save the opening lines that stop the scroll, tag them by niche or angle, and reuse them in any script.",
      savedHeading: "Saved hooks",
      fromTranscriptsHeading: "From your transcripts",
      fromTranscriptsSubtitle:
        "Opening lines pulled from every reel you've transcribed — save the good ones to your library.",
    },
    explorer: {
      searchPlaceholder: "Search hooks…",
      count: (count: number) => (count === 1 ? "1 hook" : `${count} hooks`),
      matchesSearchSuffix: " match your search",
      savedTitle: "Saved to library",
      saveTitle: "Save to library",
      copyTitle: "Copy hook",
      copyAria: "Copy hook",
      writeScriptTitle: "Write a script from this",
      writeScriptAria: "Write a script from this",
      openReelTitle: "Open original reel",
      openReelAria: "Open original reel",
      copiedToast: "Hook copied",
      copyError: "Could not copy",
      savedToast: "Saved to your library",
      saveError: "Could not save hook",
    },
    library: {
      searchPlaceholder: "Search saved hooks…",
      count: (count: number) => (count === 1 ? "1 hook" : `${count} hooks`),
      clearButton: "clear",
      emptyState:
        "No saved hooks yet. Save a reel's opening line from the transcript panel or the suggestions below, and it'll live here — tag it and reuse it in any script.",
      copyTitle: "Copy hook",
      copyAria: "Copy hook",
      useInScriptTitle: "Use in a script",
      useInScriptAria: "Use in a script",
      openReelTitle: "Open original reel",
      openReelAria: "Open original reel",
      removeTitle: "Remove hook",
      removeAria: "Remove hook",
      removeTagAria: (tag: string) => `Remove tag ${tag}`,
      addTagPlaceholder: "tag…",
      addTagButton: "tag",
      copiedToast: "Hook copied",
      copyError: "Could not copy",
      removedToast: "Hook removed",
      removeError: "Could not remove hook",
      tagsUpdateError: "Could not update tags",
    },
  },
};

export type HooksDict = typeof en;
export const hooksEn = en;

export const hooksAr: HooksDict = {
  hooks: {
    page: {
      title: "مكتبة الجمل الافتتاحية",
      subtitle: "احفظ الجمل الافتتاحية التي توقف المتابع عن التمرير، وصنّفها حسب المجال أو الزاوية، وأعد استخدامها في أي نص.",
      savedHeading: "الجمل المحفوظة",
      fromTranscriptsHeading: "من نصوصك المفرَّغة",
      fromTranscriptsSubtitle:
        "جمل افتتاحية مستخرجة من كل ريل قمت بتفريغه نصيًا — احفظ الجيدة منها في مكتبتك.",
    },
    explorer: {
      searchPlaceholder: "ابحث في الجمل الافتتاحية…",
      count: (count: number) => (count === 1 ? "جملة واحدة" : `${count} جمل`),
      matchesSearchSuffix: " مطابقة لبحثك",
      savedTitle: "محفوظة في المكتبة",
      saveTitle: "حفظ في المكتبة",
      copyTitle: "نسخ الجملة",
      copyAria: "نسخ الجملة",
      writeScriptTitle: "كتابة نص من هذه الجملة",
      writeScriptAria: "كتابة نص من هذه الجملة",
      openReelTitle: "فتح الريل الأصلي",
      openReelAria: "فتح الريل الأصلي",
      copiedToast: "تم نسخ الجملة",
      copyError: "تعذّر النسخ",
      savedToast: "تم الحفظ في مكتبتك",
      saveError: "تعذّر حفظ الجملة",
    },
    library: {
      searchPlaceholder: "ابحث في الجمل المحفوظة…",
      count: (count: number) => (count === 1 ? "جملة واحدة" : `${count} جمل`),
      clearButton: "مسح",
      emptyState:
        "لا توجد جمل افتتاحية محفوظة بعد. احفظ جملة افتتاحية لريل من لوحة النص المفرَّغ أو من الاقتراحات أدناه، وستظهر هنا — صنّفها وأعد استخدامها في أي نص.",
      copyTitle: "نسخ الجملة",
      copyAria: "نسخ الجملة",
      useInScriptTitle: "استخدام في نص",
      useInScriptAria: "استخدام في نص",
      openReelTitle: "فتح الريل الأصلي",
      openReelAria: "فتح الريل الأصلي",
      removeTitle: "إزالة الجملة",
      removeAria: "إزالة الجملة",
      removeTagAria: (tag: string) => `إزالة الوسم ${tag}`,
      addTagPlaceholder: "وسم…",
      addTagButton: "وسم",
      copiedToast: "تم نسخ الجملة",
      copyError: "تعذّر النسخ",
      removedToast: "تمت إزالة الجملة",
      removeError: "تعذّرت إزالة الجملة",
      tagsUpdateError: "تعذّر تحديث الوسوم",
    },
  },
};
