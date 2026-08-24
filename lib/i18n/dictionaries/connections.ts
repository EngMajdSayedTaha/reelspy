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
    stateExpired:
      "This connection attempt took too long and expired. Tap Connect again — you'll be signed in to Instagram already, so it should be quick.",
    missingCode: "The provider did not return an authorization code.",
    oauthFailed: "Connection failed. Please try again.",
    tiktokEnvMissing: "TikTok isn't configured on the server yet.",
    youtubeEnvMissing: "YouTube isn't configured on the server yet.",
    threadsEnvMissing:
      "Threads isn't configured on the server yet — it needs its own Threads App ID and secret, not the Meta app's.",
    unsupportedPlatform: "That platform can't be connected here.",
    metaEnvMissing: "Instagram connection isn't configured yet. Contact support.",
    profileUpdateFailed: "Connected, but we couldn't save your connection. Please retry.",
    accountLinkFailed: "Connected, but we couldn't link your account. Please retry.",
    noIgBusinessAccount:
      "No Instagram Business account was found on that Facebook login. This means one of two things: (1) your Instagram is a Personal account — switch it to Business or Creator in the Instagram app first, or (2) it's already Business/Creator but isn't linked to a Facebook Page yet — link one in Instagram's account settings. Either way, once fixed, reconnect.",
    connectionCancelled: "You cancelled before finishing. Nothing was connected — tap Connect whenever you're ready.",
    genericError: "Something went wrong.",

    connectedSuccess: "Account connected successfully.",
    disconnectedSuccess: "Account disconnected. You can reconnect below.",

    igExpired: "Your connection expired — reconnect to resume syncing.",
    igRenewsThrough: (date: string) => `Renews automatically · valid through ${date}`,
    connectionActive: "Connection active.",
    lastRenewal: (date: string) => `Last renewal: ${date}`,

    igNote:
      "Powers reel syncing, insights, publishing & auto-reply. Requires an IG Business/Creator account linked to a Facebook Page.",

    // Shown above the Instagram card while META_BETA_MODE=true (Meta app still
    // in Development mode, pre-Advanced-Access). A non-tester who clicks
    // Connect anyway doesn't get an error we can show — Facebook's own "App
    // Not Active" page never redirects back to us — so this has to prevent the
    // dead end, not react to it. See Plan_Reelspy/09-platform-access.md Phase 0.
    betaGate: {
      heading: "Instagram is in private beta right now",
      body: "Before Connect works for you, you need to accept a one-time tester invitation on Facebook — otherwise Facebook will show a dead-end page instead of the sign-in screen.",
      stepsHeading: "Accept your invite:",
      steps: [
        "On desktop: Facebook → Settings & Privacy → Settings → Apps and Websites → Business Integrations → Requests.",
        "On mobile: Facebook app → Menu → Settings & Privacy → Settings → Apps and Websites.",
        "Accept the ReelSpy tester invitation, then come back here and press Connect.",
      ],
      noInviteYet: "Haven't received an invite yet?",
      requestAccess: "Request access",
      requestAccessSubject: "ReelSpy beta access request",
    },
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
    threadsNote: "Posts text, photos, videos and carousels via the Threads API.",

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
    stateExpired:
      "استغرقت محاولة الربط وقتًا طويلًا وانتهت صلاحيتها. اضغط «ربط» مرة أخرى — ستكون مسجّلًا في إنستغرام بالفعل، لذا ستكون العملية سريعة.",
    missingCode: "لم يُرجع المزوّد رمز التفويض.",
    oauthFailed: "فشل الربط. يرجى المحاولة مرة أخرى.",
    tiktokEnvMissing: "تيك توك غير مهيأ على الخادم بعد.",
    youtubeEnvMissing: "يوتيوب غير مهيأ على الخادم بعد.",
    threadsEnvMissing:
      "ثريدز غير مهيأ على الخادم بعد — فهو يحتاج معرّف تطبيق Threads وسرّه الخاصين، لا بيانات تطبيق ميتا.",
    unsupportedPlatform: "لا يمكن ربط هذه المنصة من هنا.",
    metaEnvMissing: "ربط إنستغرام غير مهيأ بعد. يرجى التواصل مع الدعم.",
    profileUpdateFailed: "تم الربط، لكن تعذّر حفظ الاتصال. يرجى إعادة المحاولة.",
    accountLinkFailed: "تم الربط، لكن تعذّر ربط حسابك. يرجى إعادة المحاولة.",
    noIgBusinessAccount:
      "لم يتم العثور على حساب إنستغرام تجاري مرتبط بحساب فيسبوك هذا. هناك احتمالان: (1) حسابك على إنستغرام شخصي — حوّله إلى تجاري أو لصانع محتوى من تطبيق إنستغرام أولًا، أو (2) هو تجاري/لصانع محتوى بالفعل لكنه غير مرتبط بصفحة فيسبوك — اربط صفحة من إعدادات حساب إنستغرام. في الحالتين، أعد الربط بعد الإصلاح.",
    connectionCancelled: "ألغيت العملية قبل إتمامها. لم يتم ربط أي شيء — اضغط «ربط» متى شئت.",
    genericError: "حدث خطأ ما.",

    connectedSuccess: "تم ربط الحساب بنجاح.",
    disconnectedSuccess: "تم قطع ربط الحساب. يمكنك إعادة الربط أدناه.",

    igExpired: "انتهت صلاحية الربط — أعد الربط لاستئناف المزامنة.",
    igRenewsThrough: (date: string) => `يتجدد تلقائيًا · ساري حتى ${date}`,
    connectionActive: "الربط نشط.",
    lastRenewal: (date: string) => `آخر تجديد: ${date}`,

    igNote:
      "يشغّل مزامنة الريلز والإحصاءات والنشر والرد الآلي. يتطلب حساب إنستغرام تجاري أو لصانع محتوى مرتبطًا بصفحة فيسبوك.",

    betaGate: {
      heading: "إنستغرام حاليًا في نسخة تجريبية مغلقة",
      body: "قبل أن يعمل «ربط» لديك، تحتاج إلى قبول دعوة اختبار لمرة واحدة على فيسبوك — وإلا ستُظهر فيسبوك صفحة مسدودة بدلًا من شاشة تسجيل الدخول.",
      stepsHeading: "لقبول الدعوة:",
      steps: [
        "على الحاسوب: فيسبوك ← الإعدادات والخصوصية ← الإعدادات ← التطبيقات والمواقع الإلكترونية ← تكاملات الأعمال ← الطلبات.",
        "على الجوال: تطبيق فيسبوك ← القائمة ← الإعدادات والخصوصية ← الإعدادات ← التطبيقات والمواقع الإلكترونية.",
        "اقبل دعوة اختبار ReelSpy، ثم عد إلى هنا واضغط «ربط».",
      ],
      noInviteYet: "لم تصلك دعوة بعد؟",
      requestAccess: "طلب الوصول",
      requestAccessSubject: "طلب الوصول لنسخة ReelSpy التجريبية",
    },

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
    threadsNote: "ينشر النصوص والصور والفيديوهات والألبومات عبر واجهة Threads API.",

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
