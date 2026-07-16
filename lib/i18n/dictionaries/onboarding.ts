// Onboarding dictionary domain: the 4-step wizard (`/dashboard/onboarding`),
// its brand-voice form, its action buttons (starter pack / add accounts /
// sync / finish), and the dashboard-home setup checklist card. Composed into
// the root `Dict` by `lib/i18n/dictionaries/index.ts`.

const en = {
  onboarding: {
    // Stepper
    stepConnect: "Connect",
    stepBrandVoice: "Brand voice",
    stepAddAccounts: "Add accounts",
    stepFirstScript: "First script",

    // Page shell
    pageTitle: "Let's get you set up",
    pageSubtitle: "Four quick steps to your first script — about ten minutes.",
    skipForNow: "Skip for now",
    back: "Back",
    continueLabel: "Continue",

    // Step 1 — connect
    step1Title: "Connect Instagram",
    step1Desc:
      "ReelSpy pulls competitor reels through your Instagram Business account. It's the richest data source — but you can start with a ready-made starter pack and connect later.",
    instagramConnected: "Instagram connected.",
    connectInstagram: "Connect Instagram",
    starterPackHint:
      "A starter pack seeds a few popular accounts from our shared cache — zero setup, no Instagram needed.",
    pickEitherToContinue: "Pick either to continue.",

    // Step 2 — brand voice
    step2Title: "Your brand voice",
    step2Desc:
      "This is what makes generated scripts sound like you and not a generic template. Two lines is enough to start — you can refine it later in Settings.",
    saveAndContinue: "Save & continue",

    // Step 3 — add accounts. Title is plan-aware (accountsCap, -1 = unlimited)
    // so a Free user isn't told to "add 3-5" when 3 is their hard ceiling.
    step3Title: (cap: number) =>
      cap < 0 ? "Add accounts to track" : `Add up to ${cap} account${cap === 1 ? "" : "s"} to track`,
    step3Desc:
      "Pick creators in your niche whose reels you want to learn from. Add them by handle — they enrich automatically on the first sync.",
    or: "or",
    trackingAccounts: (count: number, enough: boolean) =>
      `Tracking ${count} account${count === 1 ? "" : "s"}${
        enough ? " — nice, that's plenty to start." : " — a few more makes your feed richer."
      }`,

    // Step 4 — first script
    step4Title: "Write your first script",
    step4Desc: "This is the payoff — turn a competitor's reel into an original script in your voice.",
    firstScriptDone: "You wrote your first script. You're all set!",
    goToDashboard: "Go to dashboard",
    topReelPicked: "We picked your feed's top-performing reel to start from.",
    writeFirstScript: "Write my first script",
    illDoThisLater: "I'll do this later",
    syncFeedPrompt: "Sync your feed to pull the latest reels from the accounts you track, then pick one to write from.",
    connectToPullReels:
      "Connect Instagram to pull reels from the accounts you track — that's what powers script generation. You can also skip to the dashboard and explore first.",
    skipToDashboard: "Skip to dashboard",

    // OnboardingControls
    skipUseStarterPack: "Skip — use a starter pack",
    addUsernamePlaceholder: "handles, space or comma separated — e.g. creator1, creator2",
    addAccounts: "Add accounts",
    addAtLeastOneUsername: "Add at least one username.",
    addedStarterAccounts: (n: number) => `Added ${n} starter account${n === 1 ? "" : "s"}`,
    addedAccounts: (n: number, limited: number) =>
      `Added ${n} account${n === 1 ? "" : "s"}${limited > 0 ? ` (${limited} over your plan limit skipped)` : ""}`,
    alreadyTracked: "Those accounts were already tracked.",
    syncMyFeed: "Sync my feed",
    syncingFeed: "Syncing your feed...",
    feedSynced: "Feed synced",
    syncFailed: "Sync failed. Try again.",
    finish: "Finish",
    dismiss: "Dismiss",

    // SetupChecklist (dashboard home)
    finishSettingUp: "Finish setting up ReelSpy",
    progressLine: (done: number, pct: number) => `${done} of 4 done — you're ${pct}% of the way to your first script.`,
    checklistTimeLeft: (mins: number) => `about ${mins} min left`,
    nextStepCta: (step: number): string =>
      step === 1
        ? "Connect Instagram"
        : step === 2
          ? "Set your brand voice"
          : step === 3
            ? "Track accounts"
            : "Write your first script",
    checklistConnectOrStarter: "Connect Instagram or add a starter pack",
    checklistSetBrandVoice: "Set your brand voice",
    checklistTrackAccounts: "Track a few accounts",

    // BrandVoiceForm
    nicheQuestion: "What's your niche or topic?",
    nichePlaceholder: "e.g. real-estate lead-gen for Dubai agents",
    audienceQuestion: "Who are you talking to?",
    audiencePlaceholder: "e.g. solo agents and small brokerages in the UAE",
    offerLabel: "Your offer or point of view",
    offerPlaceholder: "e.g. I help agents close more listings with short-form video",
    voiceToneLabel: "Voice & tone",
    voiceTonePlaceholder: "e.g. direct, no fluff, a bit witty",
    languageLabel: "Primary language",
    languagePlaceholder: "e.g. English, or English + Arabic hooks",
    arabicPresetLabel: "Arabic script preset",
    arabicPresetOff: "Off — match the reel / language above",
    arabicPresetHint: "Force every generated script into Arabic — Gulf dialect or Modern Standard Arabic.",
    brandVoiceSaved: "Brand voice saved",
    couldNotSave: "Could not save. Please try again.",

    // Server action errors (onboarding/actions.ts) — already-translated strings
    // returned to the client via `{ error }`, shown through toast.error().
    unauthorized: "Unauthorized.",
    tellUsNicheAndAudience: "Tell us at least your niche and who you're talking to.",
    noStarterAccountsAvailable: "No starter accounts are available yet — connect Instagram or add accounts manually.",
    alreadyTrackStarterAccounts: "You already track the starter accounts.",
  },
};

export type OnboardingDict = typeof en;
export const onboardingEn = en;

export const onboardingAr: OnboardingDict = {
  onboarding: {
    stepConnect: "الربط",
    stepBrandVoice: "أسلوب العلامة",
    stepAddAccounts: "إضافة حسابات",
    stepFirstScript: "أول نص",

    pageTitle: "لنجهّز حسابك",
    pageSubtitle: "أربع خطوات سريعة لأول نص لك — نحو عشر دقائق.",
    skipForNow: "تخطي الآن",
    back: "رجوع",
    continueLabel: "متابعة",

    step1Title: "ربط إنستغرام",
    step1Desc:
      "يسحب ReelSpy ريلز المنافسين عبر حساب إنستغرام للأعمال الخاص بك — وهو أغنى مصدر للبيانات، لكن يمكنك البدء بحزمة جاهزة والربط لاحقًا.",
    instagramConnected: "تم ربط إنستغرام.",
    connectInstagram: "ربط إنستغرام",
    starterPackHint:
      "تضيف الحزمة الجاهزة بضعة حسابات شائعة من ذاكرتنا المخزّنة المشتركة — بلا أي إعداد ودون الحاجة لربط إنستغرام.",
    pickEitherToContinue: "اختر أحد الخيارين للمتابعة.",

    step2Title: "أسلوب علامتك",
    step2Desc:
      "هذا ما يجعل النصوص المُنشأة تبدو بأسلوبك لا كقالب عام. سطران كافيان للبدء — ويمكنك تحسينه لاحقًا من الإعدادات.",
    saveAndContinue: "حفظ ومتابعة",

    step3Title: (cap: number) =>
      cap < 0 ? "أضف حسابات لمتابعتها" : `أضف حتى ${cap} ${cap === 1 ? "حساب" : cap === 2 ? "حسابين" : "حسابات"} لمتابعتها`,
    step3Desc:
      "اختر صنّاع محتوى في مجالك تريد التعلّم من ريلاتهم. أضفهم بمعرّف الحساب — يُثرى الحساب تلقائيًا عند أول مزامنة.",
    or: "أو",
    trackingAccounts: (count: number, enough: boolean) =>
      `تتابع ${count} ${count === 1 ? "حساب" : count === 2 ? "حسابين" : "حسابات"}${
        enough ? " — رائع، هذا يكفي للبدء." : " — إضافة المزيد تُثري محتواك."
      }`,

    step4Title: "اكتب أول نص لك",
    step4Desc: "هذه هي الثمرة — حوّل ريل أحد المنافسين إلى نص أصلي بأسلوبك.",
    firstScriptDone: "لقد كتبت أول نص لك. كل شيء جاهز الآن!",
    goToDashboard: "الذهاب للوحة التحكم",
    topReelPicked: "اخترنا لك أفضل ريل أداءً في محتواك للبدء منه.",
    writeFirstScript: "اكتب أول نص لي",
    illDoThisLater: "سأفعل ذلك لاحقًا",
    syncFeedPrompt: "زامن محتواك لسحب أحدث الريلز من الحسابات التي تتابعها، ثم اختر واحدًا للكتابة منه.",
    connectToPullReels:
      "اربط إنستغرام لسحب الريلز من الحسابات التي تتابعها — فهذا ما يُشغّل إنشاء النصوص. يمكنك أيضًا تخطي هذه الخطوة واستكشاف لوحة التحكم أولًا.",
    skipToDashboard: "تخطي إلى لوحة التحكم",

    skipUseStarterPack: "تخطي — استخدام حزمة جاهزة",
    addUsernamePlaceholder: "معرّفات مفصولة بمسافة أو فاصلة — مثال: creator1, creator2",
    addAccounts: "إضافة حسابات",
    addAtLeastOneUsername: "أضف معرّف حساب واحد على الأقل.",
    addedStarterAccounts: (n: number) =>
      `تمت إضافة ${n} ${n === 1 ? "حساب جاهز" : n === 2 ? "حسابين جاهزين" : "حسابات جاهزة"}`,
    addedAccounts: (n: number, limited: number) =>
      `تمت إضافة ${n} ${n === 1 ? "حساب" : n === 2 ? "حسابين" : "حسابات"}${
        limited > 0 ? ` (تم تخطي ${limited} تجاوزًا لحد باقتك)` : ""
      }`,
    alreadyTracked: "هذه الحسابات متابَعة بالفعل.",
    syncMyFeed: "مزامنة محتواي",
    syncingFeed: "جارٍ مزامنة محتواك...",
    feedSynced: "تمت مزامنة المحتوى",
    syncFailed: "فشلت المزامنة. حاول مرة أخرى.",
    finish: "إنهاء",
    dismiss: "إغلاق",

    finishSettingUp: "أكمل إعداد ReelSpy",
    progressLine: (done: number, pct: number) => `${done} من 4 خطوات مكتملة — أنت على بعد ${pct}٪ من أول نص لك.`,
    checklistTimeLeft: (mins: number) => `يتبقى نحو ${mins} دقيقة`,
    nextStepCta: (step: number) =>
      step === 1
        ? "ربط إنستغرام"
        : step === 2
          ? "حدّد أسلوب علامتك"
          : step === 3
            ? "تابع حسابات"
            : "اكتب أول نص لك",
    checklistConnectOrStarter: "اربط إنستغرام أو أضف حزمة جاهزة",
    checklistSetBrandVoice: "حدّد أسلوب علامتك",
    checklistTrackAccounts: "تابع بضعة حسابات",

    nicheQuestion: "ما مجالك أو موضوعك؟",
    nichePlaceholder: "مثال: توليد عملاء للعقارات لوكلاء دبي",
    audienceQuestion: "من هو جمهورك المستهدف؟",
    audiencePlaceholder: "مثال: الوكلاء المستقلون والوسطاء الصغار في الإمارات",
    offerLabel: "عرضك أو وجهة نظرك",
    offerPlaceholder: "مثال: أساعد الوكلاء على إغلاق صفقات أكثر عبر فيديوهات قصيرة",
    voiceToneLabel: "الصوت والنبرة",
    voiceTonePlaceholder: "مثال: مباشر، بلا حشو، وفيه لمسة من خفة الظل",
    languageLabel: "اللغة الأساسية",
    languagePlaceholder: "مثال: الإنجليزية، أو الإنجليزية مع جمل افتتاحية بالعربية",
    arabicPresetLabel: "نمط النص العربي",
    arabicPresetOff: "إيقاف — مطابقة الريل / اللغة أعلاه",
    arabicPresetHint: "فرض إنشاء كل نص بالعربية — باللهجة الخليجية أو الفصحى.",
    brandVoiceSaved: "تم حفظ أسلوب العلامة",
    couldNotSave: "تعذّر الحفظ. يرجى المحاولة مرة أخرى.",

    unauthorized: "غير مصرَّح.",
    tellUsNicheAndAudience: "أخبرنا على الأقل بمجالك ومن تخاطبه.",
    noStarterAccountsAvailable: "لا تتوفر حسابات جاهزة حاليًا — اربط إنستغرام أو أضف حسابات يدويًا.",
    alreadyTrackStarterAccounts: "أنت تتابع الحسابات الجاهزة بالفعل.",
  },
};
