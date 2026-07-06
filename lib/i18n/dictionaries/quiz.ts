// Onboarding quiz dictionary domain: the one-time popup shown to brand-new
// users right after first login (components/onboarding/QuizModal.tsx),
// replacing the old auto-redirect into the full wizard. Composed into the
// root `Dict` by lib/i18n/dictionaries/index.ts.

const en = {
  quiz: {
    step1Title: "What's your niche?",
    step1Desc:
      "This is the one thing we need to personalize your dashboard — everything else is optional.",
    nicheLabel: "Your niche or topic",
    nichePlaceholder: "e.g. real-estate lead-gen for Dubai agents",

    step2Title: "Tell us more (optional)",
    step2Desc: "The more we know, the better your generated scripts sound like you.",
    audienceLabel: "Who are you talking to?",
    audiencePlaceholder: "e.g. solo agents and small brokerages in the UAE",
    offerLabel: "Your offer or point of view",
    offerPlaceholder: "e.g. I help agents close more listings with short-form video",

    step3Title: "Voice & language (optional)",
    step3Desc: "Fine-tune the tone and language of everything the AI writes for you.",
    toneLabel: "Voice & tone",
    tonePlaceholder: "e.g. direct, no fluff, a bit witty",
    languageLabel: "Primary language",
    languagePlaceholder: "e.g. English, or English + Arabic hooks",
    arabicPresetLabel: "Arabic script preset",
    arabicPresetOff: "Off — match the language above",

    skipForNow: "Skip for now",
    finish: "Finish",
    savedToast: "You're all set — personalizing your dashboard.",
  },
};

export type QuizDict = typeof en;
export const quizEn = en;

export const quizAr: QuizDict = {
  quiz: {
    step1Title: "ما هو مجالك؟",
    step1Desc: "هذا هو الشيء الوحيد الذي نحتاجه لتخصيص لوحة تحكمك — كل ما عداه اختياري.",
    nicheLabel: "مجالك أو موضوعك",
    nichePlaceholder: "مثال: توليد عملاء للعقارات لوكلاء دبي",

    step2Title: "أخبرنا المزيد (اختياري)",
    step2Desc: "كلما عرفنا أكثر، كانت النصوص المُنشأة أقرب لأسلوبك.",
    audienceLabel: "من هو جمهورك المستهدف؟",
    audiencePlaceholder: "مثال: الوكلاء المستقلون والوسطاء الصغار في الإمارات",
    offerLabel: "عرضك أو وجهة نظرك",
    offerPlaceholder: "مثال: أساعد الوكلاء على إغلاق صفقات أكثر عبر فيديوهات قصيرة",

    step3Title: "الصوت واللغة (اختياري)",
    step3Desc: "اضبط نبرة ولغة كل ما تكتبه الذكاء الاصطناعي لك.",
    toneLabel: "الصوت والنبرة",
    tonePlaceholder: "مثال: مباشر، بلا حشو، وفيه لمسة من خفة الظل",
    languageLabel: "اللغة الأساسية",
    languagePlaceholder: "مثال: الإنجليزية، أو الإنجليزية مع جمل افتتاحية بالعربية",
    arabicPresetLabel: "نمط النص العربي",
    arabicPresetOff: "إيقاف — مطابقة اللغة أعلاه",

    skipForNow: "تخطي الآن",
    finish: "إنهاء",
    savedToast: "كل شيء جاهز — جارٍ تخصيص لوحة تحكمك.",
  },
};
