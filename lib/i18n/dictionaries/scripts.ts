// Scripts dictionary domain: the script generator (caption/transcript →
// hook/body/CTA), its output card, the saved-scripts history list, and the
// two pages that host them (`/dashboard/scripts`, `/dashboard/generate/[id]`).
// Composed into the root `Dict` by `lib/i18n/dictionaries/index.ts`.

const en = {
  scripts: {
    // /dashboard/scripts page
    pageTitle: "Scripts",
    pageSubtitle: "Generate new scripts and browse everything you've created so far.",
    openWithHook: (hook: string) => `Open with this exact hook: "${hook}"`,

    // /dashboard/generate/[reel_id] page
    generatePageTitle: "Generate Script",
    generatePageSubtitle: "Create an original script from this reel inspiration.",
    sourceReelLabel: "Source reel",

    // ScriptGenerator — reel link → transcript
    transcribeFromLink: "Transcribe from Instagram Link",
    transcribe: "Transcribe",
    transcribing: "Transcribing…",
    transcriptLoaded: "Transcript loaded",
    couldNotFetchReel: "Could not fetch reel.",
    reelFetchMessages: [
      "Fetching reel…",
      "Extracting audio…",
      "Transcribing with Whisper…",
      "Almost done…",
    ] as string[],

    // ScriptGenerator — caption / platform / tone / context
    captionLabel: "Reel Caption / Context",
    captionPlaceholder: "Paste the inspiration reel caption here...",
    platformLabel: "Platform",
    toneLabel: "Tone",
    tones: {
      Casual: "Casual",
      Direct: "Direct",
      Educational: "Educational",
    } as Record<string, string>,
    customContextLabel: "Custom Context",
    customContextHint: "(optional — add your angle or topic)",
    customContextPlaceholder: "e.g. I want this to be about Angular signals...",

    // ScriptGenerator — transcript status hints + generate action
    degradedHintFailed:
      "Transcription failed for this reel — this script will be based on the caption only. Retry it in the transcript panel above to ground on the actual audio.",
    degradedHintPending:
      "The transcript is still processing — you can generate a caption-only draft now, or wait for grounding.",
    degradedHintNone:
      "No transcript yet — add one in the panel above to ground the script on the reel's audio, or generate a caption-only draft.",
    generate: "Generate Script",
    generating: "Generating...",
    generatingMessages: [
      "Reading the reel context…",
      "Writing a scroll-stopping hook…",
      "Shaping the script…",
      "Adding a natural call to action…",
    ] as string[],
    aiUnavailable: "AI is unavailable right now — showing a placeholder. Try again in a moment.",
    scriptGenerated: "Script generated",
    failedToGenerate: "Failed to generate script.",
    transcriptReadyRegenerating: "Transcript ready — regenerating",
    couldNotTranscribe: "Could not transcribe this reel. Try again shortly.",
    placeholderNotice:
      "This is a generic placeholder — the AI didn't respond in time, so no real script was generated (and it wasn't saved). Tap Generate Script again in a moment.",
    groundedOnTranscript: "Grounded on transcript",
    captionOnly: "Caption only",
    transcribeFirstThenRegenerate: "Transcribe first, then regenerate",

    // ScriptOutput / hook-body-cta labels (shared with ScriptsList cards)
    hook: "Hook",
    body: "Body",
    cta: "CTA",
    copy: "Copy",
    copied: "Copied!",
    copyAll: "Copy All",
    copyFullScript: "Copy Full Script",

    // ScriptsList
    history: "History",
    searchPlaceholder: "Search scripts…",
    trackedReel: "Tracked reel",
    open: "Open",
    openOnInstagram: "Open on Instagram",
    publishDateLabel: "Publish date",
    collapse: "Collapse",
    expand: "Expand",
    schedule: "Schedule",
    noScriptsMatch: (query: string) => `No scripts match “${query}”.`,
    noScriptsYet: "No scripts yet. Generate one above or from the Feed page.",
    noStatusScripts: (status: string) => `No ${status} scripts.`,
    movedTo: (status: string) => `Moved to ${status}`,
    couldNotUpdateStatus: "Could not update the script status.",
    scheduledFor: (date: string) => `Scheduled for ${date}`,
    scheduledOn: (date: string) => `Scheduled: ${date}`,
    couldNotSchedule: "Could not schedule the script.",
    deleteTitle: "Delete this script?",
    deleteDescription: "This can't be undone.",
    scriptDeleted: "Script deleted",
    couldNotDelete: "Could not delete the script.",
    statuses: {
      all: "All",
      draft: "Draft",
      ready: "Ready",
      published: "Published",
    } as Record<string, string>,
  },
};

export type ScriptsDict = typeof en;
export const scriptsEn = en;

export const scriptsAr: ScriptsDict = {
  scripts: {
    pageTitle: "النصوص",
    pageSubtitle: "أنشئ نصوصًا جديدة وتصفّح كل ما أنشأته حتى الآن.",
    openWithHook: (hook: string) => `ابدأ بهذه الجملة الافتتاحية بالضبط: "${hook}"`,

    generatePageTitle: "إنشاء نص",
    generatePageSubtitle: "حوّل هذا الريل الملهِم إلى نص أصلي بأسلوبك.",
    sourceReelLabel: "الريل المصدر",

    transcribeFromLink: "تفريغ نصي من رابط إنستغرام",
    transcribe: "تفريغ",
    transcribing: "جارٍ التفريغ…",
    transcriptLoaded: "تم تحميل النص المفرَّغ",
    couldNotFetchReel: "تعذّر جلب الريل.",
    reelFetchMessages: [
      "جارٍ جلب الريل…",
      "جارٍ استخراج الصوت…",
      "جارٍ التفريغ عبر Whisper…",
      "على وشك الانتهاء…",
    ],

    captionLabel: "تعليق الريل / السياق",
    captionPlaceholder: "الصق تعليق الريل الملهِم هنا...",
    platformLabel: "المنصة",
    toneLabel: "النبرة",
    tones: {
      Casual: "غير رسمية",
      Direct: "مباشرة",
      Educational: "تعليمية",
    },
    customContextLabel: "سياق إضافي",
    customContextHint: "(اختياري — أضف زاويتك أو موضوعك)",
    customContextPlaceholder: "مثال: أريد أن يتناول هذا موضوع Angular signals...",

    degradedHintFailed:
      "فشل تفريغ هذا الريل نصيًا — سيُبنى هذا النص على التعليق فقط. أعد المحاولة من لوحة النص المفرَّغ أعلاه للاعتماد على الصوت الفعلي.",
    degradedHintPending:
      "النص المفرَّغ لا يزال قيد المعالجة — يمكنك إنشاء مسودة بالاعتماد على التعليق فقط الآن، أو الانتظار حتى يكتمل.",
    degradedHintNone:
      "لا يوجد نص مفرَّغ بعد — أضف واحدًا في اللوحة أعلاه للاعتماد على صوت الريل، أو أنشئ مسودة بالاعتماد على التعليق فقط.",
    generate: "إنشاء النص",
    generating: "جارٍ الإنشاء...",
    generatingMessages: [
      "جارٍ قراءة سياق الريل…",
      "جارٍ كتابة جملة افتتاحية جذابة…",
      "جارٍ صياغة النص…",
      "جارٍ إضافة دعوة طبيعية لاتخاذ إجراء…",
    ],
    aiUnavailable: "الذكاء الاصطناعي غير متاح حاليًا — نعرض نصًا بديلًا مؤقتًا. أعد المحاولة بعد قليل.",
    scriptGenerated: "تم إنشاء النص",
    failedToGenerate: "تعذّر إنشاء النص.",
    transcriptReadyRegenerating: "النص المفرَّغ جاهز — جارٍ إعادة الإنشاء",
    couldNotTranscribe: "تعذّر تفريغ هذا الريل نصيًا. أعد المحاولة بعد قليل.",
    placeholderNotice:
      "هذا نص بديل عام — لم يستجب الذكاء الاصطناعي في الوقت المناسب، لذا لم يُنشأ نص فعلي (ولم يُحفظ). اضغط إنشاء النص مرة أخرى بعد قليل.",
    groundedOnTranscript: "مبني على النص المفرَّغ",
    captionOnly: "التعليق فقط",
    transcribeFirstThenRegenerate: "فرِّغ النص أولًا، ثم أعد الإنشاء",

    hook: "الافتتاحية",
    body: "المتن",
    cta: "الدعوة لاتخاذ إجراء",
    copy: "نسخ",
    copied: "تم النسخ!",
    copyAll: "نسخ الكل",
    copyFullScript: "نسخ النص الكامل",

    history: "السجل",
    searchPlaceholder: "ابحث في النصوص…",
    trackedReel: "ريل متابَع",
    open: "فتح",
    openOnInstagram: "فتح على إنستغرام",
    publishDateLabel: "تاريخ النشر",
    collapse: "طي",
    expand: "توسيع",
    schedule: "جدولة",
    noScriptsMatch: (query: string) => `لا توجد نصوص مطابقة لـ«${query}».`,
    noScriptsYet: "لا توجد نصوص بعد. أنشئ واحدًا أعلاه أو من صفحة المحتوى.",
    noStatusScripts: (status: string) => `لا توجد نصوص بحالة ${status}.`,
    movedTo: (status: string) => `تم النقل إلى ${status}`,
    couldNotUpdateStatus: "تعذّر تحديث حالة النص.",
    scheduledFor: (date: string) => `تمت الجدولة ليوم ${date}`,
    scheduledOn: (date: string) => `مجدول: ${date}`,
    couldNotSchedule: "تعذّرت جدولة النص.",
    deleteTitle: "حذف هذا النص؟",
    deleteDescription: "لا يمكن التراجع عن هذا الإجراء.",
    scriptDeleted: "تم حذف النص",
    couldNotDelete: "تعذّر حذف النص.",
    statuses: {
      all: "الكل",
      draft: "مسودة",
      ready: "جاهز",
      published: "منشور",
    },
  },
};
