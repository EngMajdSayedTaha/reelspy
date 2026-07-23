// Publishing dictionary domain: the composer (`PublishComposer`/`PublishPreview`),
// connection cards, post history + actions on `/dashboard/publishing`. Composed
// into the root `Dict` by `lib/i18n/dictionaries/index.ts`.

const en = {
  publishing: {
    subtitle: "Upload once, post to Instagram, Facebook, TikTok & YouTube — now or scheduled.",
    postsDidntPublish: (n: number) => `${n} post${n === 1 ? "" : "s"} didn't fully publish`,
    reviewFailedIntro: "Some platforms failed. Review the per-platform errors below and hit",
    reviewFailedOutro: "— only the failed target re-runs, so nothing gets double-posted.",
    recentPosts: "Recent posts",
    emptyHistory: "Nothing published yet. Your posts will show here with per-platform status.",
    untitledPost: "Untitled post",
    scheduledPrefix: "Scheduled · ",
    createdPrefix: "Created · ",
    viewPost: "View post",
    status: {
      published: "Published",
      done: "Done",
      partial: "Partial",
      failed: "Failed",
      publishing: "Publishing",
      processing: "Processing",
      scheduled: "Scheduled",
      pending: "Pending",
      draft: "Draft",
    },

    // Composer
    videoLabel: "Video",
    chooseVideo: "Click to choose a video",
    videoFormats: "MP4, MOV or WebM",
    titleLabel: "Title (YouTube / FB)",
    optionalTitlePlaceholder: "Optional title",
    hashtagsLabel: "Hashtags",
    hashtagsPlaceholder: "#reels #viral",
    captionLabel: "Caption",
    captionPlaceholder: "Write the caption that goes out with the video…",
    sharedCaptionPlaceholder: "Shared caption…",
    postToLabel: "Post to",
    notConnectedSuffix: " · not connected",
    connectFirstHint: "Connect this platform first",
    connectAtLeastOne: "Connect at least one platform on the Connections tab to start posting.",
    customizeCaptionPerPlatform: "Customize caption per platform",
    perPlatformOffHint:
      "Off — every selected platform uses the shared caption above. Turn on to write a tailored caption for each one.",
    selectPlatformToCustomize: "Select a platform above to customize its caption.",
    platformCaptionLabel: (platform: string) => `${platform} caption`,
    leaveBlankPlaceholder: "Leave blank to use the shared caption…",
    captionForPlatformPlaceholder: (platform: string) => `Caption for ${platform}…`,
    visibilityLabel: "Visibility",
    visibilityPublic: "Public",
    visibilityPrivate: "Private / unlisted",
    andConnector: " & ",
    forcedPrivateWarning: (platforms: string, multiple: boolean) =>
      `${platforms} will still post privately until ${
        multiple ? "their app audits pass" : "its app audit passes"
      }.`,
    preAuditHint: (platforms: string) => `${platforms} stay private until their app audit passes.`,
    scheduleForLater: "Schedule for later",
    leaveOffHint: "Leave off to publish immediately.",
    workingButton: "Working…",
    schedulePostButton: "Schedule post",
    postNowButton: "Post now",
    chooseVideoFirst: "Choose a video to upload first.",
    selectPlatformFirst: "Select at least one platform.",
    pickDateTimeSchedule: "Pick a date and time to schedule.",
    uploadFailed: (status: number) => `Upload failed (${status}). Please try again.`,
    publishStarted: "Publishing started — check the history below for status.",
    scheduledSuccessToast: "Scheduled. It will post automatically at the chosen time.",
    publishFallbackError: "Could not publish. Please try again.",

    // Live preview
    livePreview: "Live preview",
    showPreview: "Show preview",
    hidePreview: "Hide preview",
    videoPlaceholder: "Your video appears here",
    previewCaptionPlaceholder: "Your caption will appear here…",
    selectPlatform: "Select a platform",
    untilAudit: "until audit",
    postsImmediately: "Posts immediately",

    // Connection card
    reconnectNeededBadge: "Reconnect needed",
    disconnectConfirmTitle: (platform: string) => `Disconnect ${platform}?`,
    disconnectDefaultDescription:
      "ReelSpy will remove the saved connection. Reconnect anytime to resume posting.",
    keepConnected: "Keep connected",
    couldNotDisconnect: "Could not disconnect.",
    reconnectButton: "Reconnect",
    removingEllipsis: "Removing…",

    // Post actions (retry / edit / delete)
    retryFailedToast: "Retry failed.",
    retriedRefreshing: "Retried — refreshing status.",
    pickDateTime: "Pick a date and time.",
    scheduleUpdated: "Schedule updated.",
    couldNotUpdatePost: "Could not update the post.",
    editScheduledPost: "Edit scheduled post",
    editDialogDescription: "Change when it posts or tweak the copy. Times use your local timezone.",
    scheduledTimeLabel: "Scheduled time",
    saveChanges: "Save changes",
    deletePostConfirmTitle: "Delete this post?",
    deletePostConfirmDescription:
      "The uploaded video and its publish history will be removed. Already-published posts on each platform are not affected.",
    keep: "Keep",
    deletedToast: "Deleted.",
    couldNotDelete: "Could not delete.",

    // Server action errors (actions.ts)
    pickAtLeastOnePlatform: "Pick at least one platform.",
    unauthorized: "Unauthorized.",
    noPlatformsConnected: "None of the selected platforms are connected.",
    couldNotCreatePost: "Could not create the post.",
    postNotFound: "Post not found.",
    onlyScheduledEditable: "Only scheduled posts can be edited.",
    onlyScheduledReschedulable: "Only scheduled posts can be rescheduled.",
    jobNotFound: "Job not found.",

    pageTour: {
      steps: {
        connectAccounts: {
          title: "Connect your accounts",
          desc: "Link Instagram, Facebook, TikTok, or YouTube before publishing.",
        },
        needsAttention: {
          title: "Posts that need attention",
          desc: "Flags any post where a platform failed, so you can retry it.",
        },
        composer: {
          title: "Create a post",
          desc: "Upload a video and pick which connected platforms to publish to.",
        },
        preview: {
          title: "Live preview",
          desc: "See how your caption, hashtags, and media will look on each selected platform.",
        },
        history: {
          title: "Publish history",
          desc: "Every post you've sent, with per-platform status, retry, and edit actions.",
        },
      },
    },
  },
};

export type PublishingDict = typeof en;
export const publishingEn = en;

export const publishingAr: PublishingDict = {
  publishing: {
    subtitle: "ارفع الفيديو مرة واحدة وانشره على إنستغرام وفيسبوك وتيك توك ويوتيوب — فورًا أو مجدولًا.",
    postsDidntPublish: (n: number) =>
      n === 1 ? "منشور واحد لم يُنشر بالكامل" : `${n} منشورات لم تُنشر بالكامل`,
    reviewFailedIntro: "فشل النشر على بعض المنصات. راجع الأخطاء الخاصة بكل منصة أدناه واضغط",
    reviewFailedOutro: "— يُعاد تشغيل الهدف الفاشل فقط، حتى لا يتكرر النشر.",
    recentPosts: "المنشورات الأخيرة",
    emptyHistory: "لم يُنشر أي شيء بعد. ستظهر منشوراتك هنا مع حالة كل منصة.",
    untitledPost: "منشور بلا عنوان",
    scheduledPrefix: "مجدول · ",
    createdPrefix: "أُنشئ · ",
    viewPost: "عرض المنشور",
    status: {
      published: "منشور",
      done: "تم",
      partial: "جزئي",
      failed: "فشل",
      publishing: "قيد النشر",
      processing: "قيد المعالجة",
      scheduled: "مجدول",
      pending: "قيد الانتظار",
      draft: "مسودة",
    },

    videoLabel: "الفيديو",
    chooseVideo: "اضغط لاختيار فيديو",
    videoFormats: "MP4 أو MOV أو WebM",
    titleLabel: "العنوان (يوتيوب / فيسبوك)",
    optionalTitlePlaceholder: "عنوان اختياري",
    hashtagsLabel: "الوسوم",
    hashtagsPlaceholder: "#reels #viral",
    captionLabel: "الوصف",
    captionPlaceholder: "اكتب الوصف الذي سيُنشر مع الفيديو…",
    sharedCaptionPlaceholder: "الوصف المشترك…",
    postToLabel: "النشر على",
    notConnectedSuffix: " · غير متصل",
    connectFirstHint: "اربط هذه المنصة أولًا",
    connectAtLeastOne: "اربط منصة واحدة على الأقل من تبويب الربط لتتمكن من النشر.",
    customizeCaptionPerPlatform: "تخصيص الوصف لكل منصة",
    perPlatformOffHint:
      "متوقف — تستخدم كل منصة مختارة الوصف المشترك أعلاه. فعّل الخيار لكتابة وصف مخصص لكل منصة.",
    selectPlatformToCustomize: "اختر منصة أعلاه لتخصيص وصفها.",
    platformCaptionLabel: (platform: string) => `وصف ${platform}`,
    leaveBlankPlaceholder: "اتركه فارغًا لاستخدام الوصف المشترك…",
    captionForPlatformPlaceholder: (platform: string) => `وصف ${platform}…`,
    visibilityLabel: "الظهور",
    visibilityPublic: "عام",
    visibilityPrivate: "خاص / غير مدرج",
    andConnector: " و",
    forcedPrivateWarning: (platforms: string, multiple: boolean) =>
      `${platforms} سيُنشر بشكل خاص مؤقتًا حتى ${
        multiple ? "تجتاز مراجعات تطبيقاتها" : "يجتاز تطبيقها المراجعة"
      }.`,
    preAuditHint: (platforms: string) => `${platforms} تبقى خاصة حتى تجتاز مراجعة التطبيق.`,
    scheduleForLater: "الجدولة لوقت لاحق",
    leaveOffHint: "اتركه متوقفًا للنشر فورًا.",
    workingButton: "جارٍ التنفيذ…",
    schedulePostButton: "جدولة المنشور",
    postNowButton: "انشر الآن",
    chooseVideoFirst: "اختر فيديو للرفع أولًا.",
    selectPlatformFirst: "اختر منصة واحدة على الأقل.",
    pickDateTimeSchedule: "اختر تاريخًا ووقتًا للجدولة.",
    uploadFailed: (status: number) => `فشل الرفع (${status}). يرجى المحاولة مرة أخرى.`,
    publishStarted: "بدأ النشر — تحقق من السجل أدناه لمعرفة الحالة.",
    scheduledSuccessToast: "تمت الجدولة. سيُنشر تلقائيًا في الوقت المحدد.",
    publishFallbackError: "تعذّر النشر. يرجى المحاولة مرة أخرى.",

    livePreview: "معاينة مباشرة",
    showPreview: "عرض المعاينة",
    hidePreview: "إخفاء المعاينة",
    videoPlaceholder: "سيظهر فيديوك هنا",
    previewCaptionPlaceholder: "سيظهر وصفك هنا…",
    selectPlatform: "اختر منصة",
    untilAudit: "حتى اجتياز المراجعة",
    postsImmediately: "يُنشر فورًا",

    reconnectNeededBadge: "بحاجة لإعادة الربط",
    disconnectConfirmTitle: (platform: string) => `قطع ربط ${platform}؟`,
    disconnectDefaultDescription: "ستُزيل ReelSpy الربط المحفوظ. يمكنك إعادة الربط في أي وقت لاستئناف النشر.",
    keepConnected: "إبقاء الربط",
    couldNotDisconnect: "تعذّر قطع الربط.",
    reconnectButton: "إعادة الربط",
    removingEllipsis: "جارٍ الإزالة…",

    retryFailedToast: "فشلت إعادة المحاولة.",
    retriedRefreshing: "أُعيدت المحاولة — يجري تحديث الحالة.",
    pickDateTime: "اختر تاريخًا ووقتًا.",
    scheduleUpdated: "تم تحديث الجدولة.",
    couldNotUpdatePost: "تعذّر تحديث المنشور.",
    editScheduledPost: "تعديل المنشور المجدول",
    editDialogDescription: "غيّر موعد النشر أو عدّل النص. الأوقات بتوقيتك المحلي.",
    scheduledTimeLabel: "وقت الجدولة",
    saveChanges: "حفظ التغييرات",
    deletePostConfirmTitle: "حذف هذا المنشور؟",
    deletePostConfirmDescription:
      "سيُحذف الفيديو المرفوع وسجل النشر الخاص به. أما المنشورات التي سبق نشرها على كل منصة فلن تتأثر.",
    keep: "إبقاء",
    deletedToast: "تم الحذف.",
    couldNotDelete: "تعذّر الحذف.",

    pickAtLeastOnePlatform: "اختر منصة واحدة على الأقل.",
    unauthorized: "غير مصرح به.",
    noPlatformsConnected: "لا توجد أي منصة مختارة متصلة.",
    couldNotCreatePost: "تعذّر إنشاء المنشور.",
    postNotFound: "المنشور غير موجود.",
    onlyScheduledEditable: "يمكن تعديل المنشورات المجدولة فقط.",
    onlyScheduledReschedulable: "يمكن إعادة جدولة المنشورات المجدولة فقط.",
    jobNotFound: "المهمة غير موجودة.",

    pageTour: {
      steps: {
        connectAccounts: {
          title: "اربط حساباتك",
          desc: "اربط إنستغرام أو فيسبوك أو تيك توك أو يوتيوب قبل النشر.",
        },
        needsAttention: {
          title: "منشورات تحتاج انتباهك",
          desc: "يُبرز أي منشور فشلت إحدى المنصات في نشره، لتتمكن من إعادة المحاولة.",
        },
        composer: {
          title: "أنشئ منشورًا",
          desc: "ارفع فيديو واختر المنصات المتصلة التي تريد النشر عليها.",
        },
        preview: {
          title: "معاينة مباشرة",
          desc: "شاهد كيف سيبدو وصفك والوسوم والوسائط على كل منصة مختارة.",
        },
        history: {
          title: "سجل النشر",
          desc: "كل منشور أرسلته، مع حالة كل منصة، وإجراءات إعادة المحاولة والتعديل.",
        },
      },
    },
  },
};
