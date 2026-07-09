// Connections dictionary domain: `/dashboard/connections` hub (OAuth error
// map, per-platform connection notes) + the Studio multi-account
// `WorkspaceSwitcher`. Composed into the root `Dict` by
// `lib/i18n/dictionaries/index.ts`.

const en = {
  connections: {
    subtitle:
      "One place to connect and manage every social account ReelSpy works with — syncing, publishing and auto-reply all run off these connections.",

    // OAuth round-trip error map (query-param driven)
    invalidState: "Sign-in could not be verified. Please try connecting again.",
    missingCode: "The provider did not return an authorization code.",
    oauthFailed: "Connection failed. Please try again.",
    tiktokEnvMissing: "TikTok isn't configured on the server yet.",
    youtubeEnvMissing: "YouTube isn't configured on the server yet.",
    unsupportedPlatform: "That platform can't be connected here.",
    metaEnvMissing: "Instagram connection isn't configured yet. Contact support.",
    profileUpdateFailed: "Connected, but we couldn't save your connection. Please retry.",
    accountLinkFailed: "Connected, but we couldn't link your account. Please retry.",
    noIgBusinessAccount:
      "No Instagram Business account was found. Make sure your Instagram is a Business or Creator account linked to a Facebook Page, then reconnect.",
    genericError: "Something went wrong.",

    connectedSuccess: "Account connected successfully.",
    disconnectedSuccess: "Account disconnected. You can reconnect below.",

    igExpired: "Your connection expired — reconnect to resume syncing.",
    igRenewsThrough: (date: string) => `Renews automatically · valid through ${date}`,
    connectionActive: "Connection active.",
    lastRenewal: (date: string) => `Last renewal: ${date}`,

    igNote:
      "Powers reel syncing, insights, publishing & auto-reply. Requires an IG Business/Creator account linked to a Facebook Page.",
    disconnectInstagramTitle: "Disconnect Instagram?",
    disconnectInstagramDescription:
      "ReelSpy will remove your saved Instagram connection. Your tracked reels stay, but syncing, publishing and auto-reply pause until you reconnect.",
    igNotConfigured: "Instagram connection isn't configured on the server yet.",
    setupDetails: "Setup details",
    appIdLabel: "App ID:",
    notSet: "not set",
    callbackUrlLabel: "Callback URL:",
    permissionsLabel: "Permissions:",
    igBusinessRequirement: "Your Instagram must be a Business or Creator account linked to a Facebook Page.",
    fbNote: "Posts to your linked Facebook Page (connected together with Instagram).",
    pageConnected: "Page connected",
    tiktokNote: "Posts via the TikTok Content Posting API.",
    youtubeNote: "Uploads via the YouTube Data API and powers comment auto-reply.",

    footerNoteBeforeDocs:
      "Note: Instagram & Facebook posting works on your own account with no Meta App Review (the app stays in development mode). TikTok and YouTube post to your own account right away but stay private until their platform audits pass. See",
    footerNoteAfterDocs: "for the full step-by-step.",

    unauthorized: "Unauthorized.",
    couldNotSwitch: "Could not switch account. Try reconnecting it.",

    workspacesHeading: "Workspaces",
    workspacesSubtitle: "Switch which connected Instagram account drives research, sync and insights.",
    connectAnother: "Connect another",
    needsReconnect: "Needs reconnect",
    tapToActivate: "Tap to activate",
    switchingEllipsis: "Switching…",
    switchedAccount: "Switched active account",

    pageTour: {
      steps: {
        workspaceSwitcher: {
          title: "Multiple Instagram accounts",
          desc: "Switch between connected Instagram workspaces or add another one, based on your plan's limit.",
        },
        igConnection: {
          title: "Instagram / Facebook connection",
          desc: "Connect via Meta OAuth; this single connection also links your Facebook Page.",
        },
        tiktokConnection: {
          title: "TikTok connection",
          desc: "Connect your TikTok account for cross-posting and automations.",
        },
        youtubeConnection: {
          title: "YouTube connection",
          desc: "Connect your YouTube channel to enable publishing and comment automations.",
        },
      },
    },
  },
};

export type ConnectionsDict = typeof en;
export const connectionsEn = en;

export const connectionsAr: ConnectionsDict = {
  connections: {
    subtitle:
      "مكان واحد لربط وإدارة كل حساب تواصل اجتماعي تعمل معه ReelSpy — المزامنة والنشر والرد الآلي تعمل جميعها عبر هذه الروابط.",

    invalidState: "تعذّر التحقق من تسجيل الدخول. يرجى إعادة محاولة الربط.",
    missingCode: "لم يُرجع المزوّد رمز التفويض.",
    oauthFailed: "فشل الربط. يرجى المحاولة مرة أخرى.",
    tiktokEnvMissing: "تيك توك غير مهيأ على الخادم بعد.",
    youtubeEnvMissing: "يوتيوب غير مهيأ على الخادم بعد.",
    unsupportedPlatform: "لا يمكن ربط هذه المنصة من هنا.",
    metaEnvMissing: "ربط إنستغرام غير مهيأ بعد. يرجى التواصل مع الدعم.",
    profileUpdateFailed: "تم الربط، لكن تعذّر حفظ الاتصال. يرجى إعادة المحاولة.",
    accountLinkFailed: "تم الربط، لكن تعذّر ربط حسابك. يرجى إعادة المحاولة.",
    noIgBusinessAccount:
      "لم يتم العثور على حساب إنستغرام تجاري. تأكد أن حسابك تجاري أو لصانع محتوى ومرتبط بصفحة فيسبوك، ثم أعد الربط.",
    genericError: "حدث خطأ ما.",

    connectedSuccess: "تم ربط الحساب بنجاح.",
    disconnectedSuccess: "تم قطع ربط الحساب. يمكنك إعادة الربط أدناه.",

    igExpired: "انتهت صلاحية الربط — أعد الربط لاستئناف المزامنة.",
    igRenewsThrough: (date: string) => `يتجدد تلقائيًا · ساري حتى ${date}`,
    connectionActive: "الربط نشط.",
    lastRenewal: (date: string) => `آخر تجديد: ${date}`,

    igNote:
      "يشغّل مزامنة الريلز والإحصاءات والنشر والرد الآلي. يتطلب حساب إنستغرام تجاري أو لصانع محتوى مرتبطًا بصفحة فيسبوك.",
    disconnectInstagramTitle: "قطع ربط إنستغرام؟",
    disconnectInstagramDescription:
      "ستُزيل ReelSpy ربط إنستغرام المحفوظ. تبقى الريلز المتابَعة كما هي، لكن المزامنة والنشر والرد الآلي تتوقف حتى تعيد الربط.",
    igNotConfigured: "ربط إنستغرام غير مهيأ على الخادم بعد.",
    setupDetails: "تفاصيل الإعداد",
    appIdLabel: "معرّف التطبيق:",
    notSet: "غير محدد",
    callbackUrlLabel: "رابط الاستدعاء:",
    permissionsLabel: "الصلاحيات:",
    igBusinessRequirement: "يجب أن يكون حساب إنستغرام تجاريًا أو لصانع محتوى ومرتبطًا بصفحة فيسبوك.",
    fbNote: "ينشر على صفحة فيسبوك المرتبطة (تُربط مع إنستغرام معًا).",
    pageConnected: "الصفحة مرتبطة",
    tiktokNote: "ينشر عبر واجهة TikTok Content Posting API.",
    youtubeNote: "يرفع عبر YouTube Data API ويشغّل الرد الآلي على التعليقات.",

    footerNoteBeforeDocs:
      "ملاحظة: النشر على إنستغرام وفيسبوك يعمل على حسابك الخاص دون مراجعة تطبيق Meta (يبقى التطبيق في وضع التطوير). ينشر تيك توك ويوتيوب على حسابك فورًا لكنه يبقى خاصًا حتى تجتاز مراجعة كل منصة. راجع",
    footerNoteAfterDocs: "للاطلاع على كل الخطوات.",

    unauthorized: "غير مصرح به.",
    couldNotSwitch: "تعذّر تبديل الحساب. حاول إعادة ربطه.",

    workspacesHeading: "مساحات العمل",
    workspacesSubtitle: "بدّل الحساب المتصل على إنستغرام الذي يشغّل البحث والمزامنة والإحصاءات.",
    connectAnother: "ربط حساب آخر",
    needsReconnect: "بحاجة لإعادة الربط",
    tapToActivate: "اضغط للتفعيل",
    switchingEllipsis: "جارٍ التبديل…",
    switchedAccount: "تم تبديل الحساب النشط",

    pageTour: {
      steps: {
        workspaceSwitcher: {
          title: "حسابات إنستغرام متعددة",
          desc: "بدّل بين مساحات عمل إنستغرام المتصلة أو أضف واحدة أخرى، بحسب حد باقتك.",
        },
        igConnection: {
          title: "ربط إنستغرام / فيسبوك",
          desc: "اربط عبر Meta OAuth؛ هذا الربط الواحد يربط أيضًا صفحتك على فيسبوك.",
        },
        tiktokConnection: {
          title: "ربط تيك توك",
          desc: "اربط حساب تيك توك للنشر المتقاطع والأتمتة.",
        },
        youtubeConnection: {
          title: "ربط يوتيوب",
          desc: "اربط قناتك على يوتيوب لتفعيل النشر والرد الآلي على التعليقات.",
        },
      },
    },
  },
};
