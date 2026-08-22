// Publishing dictionary domain: the composer (`PublishComposer` and its parts),
// the live preview, connection cards, post history + actions on
// `/dashboard/publishing`. Composed into the root `Dict` by
// `lib/i18n/dictionaries/index.ts`.
//
// `validation.message()` owns the wording for every code
// `lib/publishing/validate.ts` can return — the validator itself is pure and
// locale-free, so this is the only place those sentences exist.

import { PLATFORM_LABELS } from "@/lib/publishing/types";
import type { Issue } from "@/lib/publishing/validate";

const en = {
  publishing: {
    subtitle:
      "Upload once — video, photo or carousel — and post it to Instagram, Facebook, TikTok, YouTube & Threads.",
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

    // ── Media picker ─────────────────────────────────────────────────────────
    mediaLabel: "Media",
    dropzoneTitle: "Drop files here, or click to choose",
    dropzoneHint: "Photos and videos · up to 35 slides for a carousel",
    dropzoneActive: "Drop to add",
    addMoreMedia: "Add more",
    slideLabel: (n: number) => `Slide ${n}`,
    slideCount: (n: number) => (n === 1 ? "1 slide" : `${n} slides`),
    removeSlide: "Remove",
    coverBadge: "Cover",
    setCover: "Use as cover",
    altTextLabel: "Alt text",
    altTextPlaceholder: "Describe this image for screen readers…",
    altTextSaved: "Alt text added",
    reorderHint: "Drag a slide to reorder. On touch, tap a slide then tap where it should go.",
    movingSlide: (n: number) => `Moving slide ${n} — tap a position, or cancel.`,
    cancelMove: "Cancel",
    moveHere: "Move here",
    uploadingLabel: "Uploading…",
    uploadedLabel: "Ready",
    uploadRetry: "Retry upload",
    unsupportedFile: (name: string) => `${name} isn't a supported photo or video.`,
    mediaKindLabels: {
      video: "Video",
      image: "Photo",
      carousel: "Carousel",
    },
    coverFrameLabel: "Cover frame",
    coverFrameHint: "Scrub to the frame Instagram should use as the thumbnail.",
    coverFrameUse: "Use this frame",
    coverFrameCleared: "Using the first frame",

    // ── Platform targets ─────────────────────────────────────────────────────
    postToLabel: "Post to",
    notConnectedSuffix: " · not connected",
    notConnectedLabel: "Not connected",
    connectFirstHint: "Connect this platform first",
    connectAtLeastOne: "Connect at least one platform on the Connections tab to start posting.",
    capCarousel: (max: number) => `Carousel · up to ${max} slides`,
    capPhotoCarousel: (max: number) => `Photo carousel · up to ${max}`,
    capVideoOnly: "Video only",
    capPhotoAndVideo: "Photo & video",
    capDailyLimit: (n: number) => `${n}/day`,
    incompatibleWithMedia: "Doesn't accept this media",

    // ── Caption ──────────────────────────────────────────────────────────────
    titleLabel: "Title (YouTube / FB)",
    optionalTitlePlaceholder: "Optional title",
    hashtagsLabel: "Hashtags",
    hashtagsPlaceholder: "#reels #viral",
    captionLabel: "Caption",
    captionPlaceholder: "Write the caption that goes out with your media…",
    sharedCaptionPlaceholder: "Shared caption…",
    sharedTab: "All platforms",
    customizeCaptionPerPlatform: "Customize caption per platform",
    perPlatformOffHint:
      "Off — every selected platform uses the shared caption above. Turn on to write a tailored caption for each one.",
    selectPlatformToCustomize: "Select a platform above to customize its caption.",
    platformCaptionLabel: (platform: string) => `${platform} caption`,
    leaveBlankPlaceholder: "Leave blank to use the shared caption…",
    captionForPlatformPlaceholder: (platform: string) => `Caption for ${platform}…`,
    charactersLeft: (left: number, max: number) => `${left} left of ${max}`,
    charactersOver: (over: number) => `${over} over`,
    hashtagCount: (count: number, max: number) => `${count}/${max} hashtags`,

    // ── Visibility + scheduling ──────────────────────────────────────────────
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
    timezoneNote: (zone: string) => `Times are in your timezone (${zone}).`,
    quickInAnHour: "In 1 hour",
    quickTonight: "Tonight, 7pm",
    quickTomorrow: "Tomorrow, 9am",

    // ── Submit ───────────────────────────────────────────────────────────────
    workingButton: "Working…",
    uploadingButton: (done: number, total: number) => `Uploading ${done}/${total}…`,
    schedulePostButton: "Schedule post",
    postNowButton: "Post now",
    chooseMediaFirst: "Add a photo or video first.",
    chooseVideoFirst: "Add a photo or video first.",
    selectPlatformFirst: "Select at least one platform.",
    pickDateTimeSchedule: "Pick a date and time to schedule.",
    uploadFailed: (status: number) => `Upload failed (${status}). Please try again.`,
    publishStarted: "Publishing started — watch the status below, it updates itself.",
    scheduledSuccessToast: "Scheduled. It will post automatically at the chosen time.",
    publishFallbackError: "Could not publish. Please try again.",

    // ── Validation summary ───────────────────────────────────────────────────
    validation: {
      errorsTitle: "Fix these before posting",
      warningsTitle: "Worth a look",
      allClear: "Everything checks out.",
      message: (issue: Issue): string => {
        const p = issue.platform ? PLATFORM_LABELS[issue.platform] : "";
        const v = issue.values ?? {};
        switch (issue.code) {
          case "noMedia":
            return "Add at least one photo or video.";
          case "noPlatforms":
            return "Pick at least one platform to post to.";
          case "mediaKindUnsupported":
            return v.mediaKind === "carousel"
              ? `${p} can't post a carousel — unselect it, or reduce this to a single slide.`
              : `${p} can't post a ${v.mediaKind === "image" ? "photo" : "video"}.`;
          case "carouselTooFew":
            return `${p} needs at least ${v.min} slides in a carousel (you have ${v.count}).`;
          case "carouselTooMany":
            return `${p} takes ${v.max} slides — remove ${v.over}, or unselect ${p}.`;
          case "carouselItemKindUnsupported":
            return v.itemKind === "video"
              ? `${p} carousels are photos only — remove the video, or unselect ${p}.`
              : `${p} can't put photos in this carousel.`;
          case "mimeUnsupported":
            return `${p} doesn't accept slide ${v.slide} (${v.mimeType}). It takes ${v.accepted}.`;
          case "fileTooLarge":
            return `Slide ${v.slide} is ${v.actualMb} MB — ${p} allows ${v.maxMb} MB.`;
          case "videoTooShort":
            return `${p} needs videos of at least ${v.min} seconds (slide ${v.slide}).`;
          case "videoTooLong":
            return `${p} caps videos at ${v.maxMinutes} minutes (slide ${v.slide}).`;
          case "captionTooLong":
            return `The ${p} caption is ${v.over} characters over its ${v.max} limit.`;
          case "titleTooLong":
            return `The title is ${v.count} characters — ${p} allows ${v.max}.`;
          case "tooManyHashtags":
            return `${p} allows ${v.max} hashtags; this caption has ${v.count}.`;
          case "scheduleInPast":
            return "That scheduled time has already passed — pick a future one.";
          case "aspectRatioOutOfRange":
            return `Slide ${v.slide} is ${v.ratio} — ${p} crops anything outside 4:5 to 1.91:1.`;
          case "altTextIgnored":
            return `${p} has no alt text field, so slide ${v.slide}'s description won't be sent there.`;
          default:
            return "Something about this post isn't valid.";
        }
      },
    },

    // ── Live preview ─────────────────────────────────────────────────────────
    livePreview: "Live preview",
    showPreview: "Show preview",
    hidePreview: "Hide preview",
    videoPlaceholder: "Your media appears here",
    previewCaptionPlaceholder: "Your caption will appear here…",
    selectPlatform: "Select a platform",
    untilAudit: "until audit",
    postsImmediately: "Posts immediately",
    previewPrevious: "Previous slide",
    previewNext: "Next slide",
    previewMore: "more",

    // ── Connection card ──────────────────────────────────────────────────────
    reconnectNeededBadge: "Reconnect needed",
    disconnectConfirmTitle: (platform: string) => `Disconnect ${platform}?`,
    disconnectDefaultDescription:
      "ReelSpy will remove the saved connection. Reconnect anytime to resume posting.",
    keepConnected: "Keep connected",
    couldNotDisconnect: "Could not disconnect.",
    reconnectButton: "Reconnect",
    removingEllipsis: "Removing…",

    // ── Post actions (retry / edit / duplicate / delete) ──────────────────────
    retryFailedToast: "Retry failed.",
    retriedRefreshing: "Retrying — the status below will update itself.",
    pickDateTime: "Pick a date and time.",
    scheduleUpdated: "Schedule updated.",
    couldNotUpdatePost: "Could not update the post.",
    editScheduledPost: "Edit scheduled post",
    editDialogDescription: "Change when it posts or tweak the copy. Times use your local timezone.",
    scheduledTimeLabel: "Scheduled time",
    saveChanges: "Save changes",
    duplicatePost: "Duplicate",
    duplicatedToast: "Duplicated as a draft.",
    couldNotDuplicate: "Could not duplicate the post.",
    deletePostConfirmTitle: "Delete this post?",
    deletePostConfirmDescription:
      "The uploaded media and its publish history will be removed. Already-published posts on each platform are not affected.",
    keep: "Keep",
    deletedToast: "Deleted.",
    couldNotDelete: "Could not delete.",

    // ── History filters ──────────────────────────────────────────────────────
    filterAll: "All",
    filterScheduled: "Scheduled",
    filterPublished: "Published",
    filterFailed: "Needs attention",
    filterEmpty: "Nothing here with that filter.",
    liveUpdating: "Updating live",

    // ── Server action errors (actions.ts) ────────────────────────────────────
    pickAtLeastOnePlatform: "Pick at least one platform.",
    unauthorized: "Unauthorized.",
    noPlatformsConnected: "None of the selected platforms are connected.",
    couldNotCreatePost: "Could not create the post.",
    postNotFound: "Post not found.",
    onlyScheduledEditable: "Only scheduled posts can be edited.",
    onlyScheduledReschedulable: "Only scheduled posts can be rescheduled.",
    jobNotFound: "Job not found.",
    tiktokBrandedPrivacyConflict:
      "TikTok doesn't allow branded content to post as private. Pick a public privacy level for TikTok, or turn off the branded-content disclosure.",

    // TikTok compliance panel (T4) — shown once TikTok is selected + connected.
    tiktokSettings: {
      heading: "TikTok settings",
      loading: "Loading your TikTok account…",
      loadFailed: (error: string) => `Couldn't load your TikTok account: ${error}`,
      postingAsPrefix: "Posting as",
      postModeLabel: "How should this post?",
      postModeDirect: "Post directly to my profile",
      postModeDraft: "Save as a draft in my TikTok inbox",
      postModeDraftHint:
        "TikTok imports the media into your inbox — you finish the caption, privacy, and disclosure inside the TikTok app.",
      privacyLevelLabel: "Privacy level",
      privacyLevelLabelFor: (level: string) => {
        switch (level) {
          case "PUBLIC_TO_EVERYONE":
            return "Everyone";
          case "MUTUAL_FOLLOW_FRIENDS":
            return "Friends (mutual follows)";
          case "FOLLOWER_OF_CREATOR":
            return "Followers";
          case "SELF_ONLY":
            return "Only me (private)";
          default:
            return level;
        }
      },
      disclosureLabel: "Content disclosure",
      brandedContentLabel: "Branded content (paid partnership)",
      brandOrganicLabel: "My own promotional content",
      brandedPrivacyWarning: "Branded content can't post as private — choose a public privacy level above.",
      brandedNeedsAuditWarning:
        "Branded content needs a public audience, but TikTok posts stay private here until the app audit passes — so this isn't usable yet.",
      autoAddMusicLabel: "Let TikTok add a soundtrack",
      autoAddMusicHint: "Photo posts only — TikTok picks a track from its library.",
      confirmBefore: "I confirm I have the rights to any music used and agree to TikTok's ",
      musicUsageLink: "Music Usage Confirmation",
      confirmMiddle: " and ",
      termsOfServiceLink: "Terms of Service",
      confirmAfter: ".",
      confirmRequiredError: "Confirm TikTok's Music Usage & Terms checkbox before posting.",
    },

    pageTour: {
      steps: {
        connectAccounts: {
          title: "Connect your accounts",
          desc: "Link Instagram, Facebook, TikTok, YouTube, or Threads before publishing.",
        },
        needsAttention: {
          title: "Posts that need attention",
          desc: "Flags any post where a platform failed, so you can retry it.",
        },
        composer: {
          title: "Create a post",
          desc: "Add a video, a photo, or up to 35 slides for a carousel, then pick where it goes.",
        },
        media: {
          title: "Media & carousels",
          desc: "Drop several files to build a carousel, drag to reorder, and set the cover slide.",
        },
        validation: {
          title: "Checks before you post",
          desc: "Every platform's real limits, checked as you type — so nothing fails after you hit post.",
        },
        preview: {
          title: "Live preview",
          desc: "See how your caption, hashtags, and media will look on each selected platform.",
        },
        history: {
          title: "Publish history",
          desc: "Every post you've sent, with per-platform status, retry, duplicate, and edit actions.",
        },
      },
    },
  },
};

export type PublishingDict = typeof en;
export const publishingEn = en;

export const publishingAr: PublishingDict = {
  publishing: {
    subtitle:
      "ارفع مرة واحدة — فيديو أو صورة أو ألبوم — وانشره على إنستغرام وفيسبوك وتيك توك ويوتيوب وثريدز.",
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

    mediaLabel: "الوسائط",
    dropzoneTitle: "أفلت الملفات هنا، أو اضغط للاختيار",
    dropzoneHint: "صور وفيديوهات · حتى 35 شريحة للألبوم",
    dropzoneActive: "أفلت للإضافة",
    addMoreMedia: "إضافة المزيد",
    slideLabel: (n: number) => `الشريحة ${n}`,
    slideCount: (n: number) => (n === 1 ? "شريحة واحدة" : `${n} شرائح`),
    removeSlide: "إزالة",
    coverBadge: "الغلاف",
    setCover: "استخدمها كغلاف",
    altTextLabel: "النص البديل",
    altTextPlaceholder: "صف هذه الصورة لقارئات الشاشة…",
    altTextSaved: "تمت إضافة النص البديل",
    reorderHint: "اسحب الشريحة لإعادة الترتيب. على الشاشات اللمسية، اضغط الشريحة ثم اضغط الموضع الجديد.",
    movingSlide: (n: number) => `جارٍ نقل الشريحة ${n} — اضغط على الموضع، أو ألغِ.`,
    cancelMove: "إلغاء",
    moveHere: "انقل هنا",
    uploadingLabel: "جارٍ الرفع…",
    uploadedLabel: "جاهزة",
    uploadRetry: "إعادة الرفع",
    unsupportedFile: (name: string) => `${name} ليس صورة أو فيديو مدعومًا.`,
    mediaKindLabels: {
      video: "فيديو",
      image: "صورة",
      carousel: "ألبوم",
    },
    coverFrameLabel: "إطار الغلاف",
    coverFrameHint: "حرّك المؤشر إلى الإطار الذي تريد أن يستخدمه إنستغرام كصورة مصغّرة.",
    coverFrameUse: "استخدم هذا الإطار",
    coverFrameCleared: "سيُستخدم الإطار الأول",

    postToLabel: "النشر على",
    notConnectedSuffix: " · غير متصل",
    notConnectedLabel: "غير متصل",
    connectFirstHint: "اربط هذه المنصة أولًا",
    connectAtLeastOne: "اربط منصة واحدة على الأقل من تبويب الربط لتتمكن من النشر.",
    capCarousel: (max: number) => `ألبوم · حتى ${max} شريحة`,
    capPhotoCarousel: (max: number) => `ألبوم صور · حتى ${max}`,
    capVideoOnly: "فيديو فقط",
    capPhotoAndVideo: "صور وفيديو",
    capDailyLimit: (n: number) => `${n}/يوم`,
    incompatibleWithMedia: "لا يقبل هذه الوسائط",

    titleLabel: "العنوان (يوتيوب / فيسبوك)",
    optionalTitlePlaceholder: "عنوان اختياري",
    hashtagsLabel: "الوسوم",
    hashtagsPlaceholder: "#reels #viral",
    captionLabel: "الوصف",
    captionPlaceholder: "اكتب الوصف الذي سيُنشر مع وسائطك…",
    sharedCaptionPlaceholder: "الوصف المشترك…",
    sharedTab: "كل المنصات",
    customizeCaptionPerPlatform: "تخصيص الوصف لكل منصة",
    perPlatformOffHint:
      "متوقف — تستخدم كل منصة مختارة الوصف المشترك أعلاه. فعّل الخيار لكتابة وصف مخصص لكل منصة.",
    selectPlatformToCustomize: "اختر منصة أعلاه لتخصيص وصفها.",
    platformCaptionLabel: (platform: string) => `وصف ${platform}`,
    leaveBlankPlaceholder: "اتركه فارغًا لاستخدام الوصف المشترك…",
    captionForPlatformPlaceholder: (platform: string) => `وصف ${platform}…`,
    charactersLeft: (left: number, max: number) => `يتبقى ${left} من ${max}`,
    charactersOver: (over: number) => `تجاوزت بـ ${over}`,
    hashtagCount: (count: number, max: number) => `${count}/${max} وسم`,

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
    timezoneNote: (zone: string) => `الأوقات بتوقيتك المحلي (${zone}).`,
    quickInAnHour: "بعد ساعة",
    quickTonight: "الليلة، 7 مساءً",
    quickTomorrow: "غدًا، 9 صباحًا",

    workingButton: "جارٍ التنفيذ…",
    uploadingButton: (done: number, total: number) => `جارٍ الرفع ${done}/${total}…`,
    schedulePostButton: "جدولة المنشور",
    postNowButton: "انشر الآن",
    chooseMediaFirst: "أضف صورة أو فيديو أولًا.",
    chooseVideoFirst: "أضف صورة أو فيديو أولًا.",
    selectPlatformFirst: "اختر منصة واحدة على الأقل.",
    pickDateTimeSchedule: "اختر تاريخًا ووقتًا للجدولة.",
    uploadFailed: (status: number) => `فشل الرفع (${status}). يرجى المحاولة مرة أخرى.`,
    publishStarted: "بدأ النشر — تابع الحالة أدناه، فهي تُحدَّث تلقائيًا.",
    scheduledSuccessToast: "تمت الجدولة. سيُنشر تلقائيًا في الوقت المحدد.",
    publishFallbackError: "تعذّر النشر. يرجى المحاولة مرة أخرى.",

    validation: {
      errorsTitle: "صحّح هذه النقاط قبل النشر",
      warningsTitle: "يستحق الانتباه",
      allClear: "كل شيء سليم.",
      message: (issue: Issue): string => {
        const p = issue.platform ? PLATFORM_LABELS[issue.platform] : "";
        const v = issue.values ?? {};
        switch (issue.code) {
          case "noMedia":
            return "أضف صورة أو فيديو واحدًا على الأقل.";
          case "noPlatforms":
            return "اختر منصة واحدة على الأقل للنشر عليها.";
          case "mediaKindUnsupported":
            return v.mediaKind === "carousel"
              ? `${p} لا يدعم نشر الألبومات — ألغِ اختياره، أو اجعل المنشور شريحة واحدة.`
              : `${p} لا يمكنه نشر ${v.mediaKind === "image" ? "صورة" : "فيديو"}.`;
          case "carouselTooFew":
            return `${p} يحتاج ${v.min} شرائح على الأقل في الألبوم (لديك ${v.count}).`;
          case "carouselTooMany":
            return `${p} يقبل ${v.max} شريحة — احذف ${v.over}، أو ألغِ اختيار ${p}.`;
          case "carouselItemKindUnsupported":
            return v.itemKind === "video"
              ? `ألبومات ${p} تقبل الصور فقط — احذف الفيديو، أو ألغِ اختيار ${p}.`
              : `${p} لا يمكنه وضع صور في هذا الألبوم.`;
          case "mimeUnsupported":
            return `${p} لا يقبل الشريحة ${v.slide} (${v.mimeType}). الصيغ المقبولة: ${v.accepted}.`;
          case "fileTooLarge":
            return `حجم الشريحة ${v.slide} هو ${v.actualMb} ميغابايت — ${p} يسمح بـ ${v.maxMb} ميغابايت.`;
          case "videoTooShort":
            return `${p} يتطلب فيديو لا يقل عن ${v.min} ثانية (الشريحة ${v.slide}).`;
          case "videoTooLong":
            return `${p} يحدّ الفيديو بـ ${v.maxMinutes} دقيقة (الشريحة ${v.slide}).`;
          case "captionTooLong":
            return `وصف ${p} يتجاوز الحد (${v.max}) بـ ${v.over} حرفًا.`;
          case "titleTooLong":
            return `طول العنوان ${v.count} حرفًا — ${p} يسمح بـ ${v.max}.`;
          case "tooManyHashtags":
            return `${p} يسمح بـ ${v.max} وسمًا؛ هذا الوصف يحتوي على ${v.count}.`;
          case "scheduleInPast":
            return "وقت الجدولة الذي اخترته قد مضى — اختر وقتًا في المستقبل.";
          case "aspectRatioOutOfRange":
            return `نسبة الشريحة ${v.slide} هي ${v.ratio} — ${p} يقصّ ما يخرج عن 4:5 إلى 1.91:1.`;
          case "altTextIgnored":
            return `${p} لا يحتوي على حقل نص بديل، لذا لن يُرسل وصف الشريحة ${v.slide} إليه.`;
          default:
            return "هناك مشكلة في هذا المنشور.";
        }
      },
    },

    livePreview: "معاينة مباشرة",
    showPreview: "عرض المعاينة",
    hidePreview: "إخفاء المعاينة",
    videoPlaceholder: "ستظهر وسائطك هنا",
    previewCaptionPlaceholder: "سيظهر وصفك هنا…",
    selectPlatform: "اختر منصة",
    untilAudit: "حتى اجتياز المراجعة",
    postsImmediately: "يُنشر فورًا",
    previewPrevious: "الشريحة السابقة",
    previewNext: "الشريحة التالية",
    previewMore: "المزيد",

    reconnectNeededBadge: "بحاجة لإعادة الربط",
    disconnectConfirmTitle: (platform: string) => `قطع ربط ${platform}؟`,
    disconnectDefaultDescription: "ستُزيل ReelSpy الربط المحفوظ. يمكنك إعادة الربط في أي وقت لاستئناف النشر.",
    keepConnected: "إبقاء الربط",
    couldNotDisconnect: "تعذّر قطع الربط.",
    reconnectButton: "إعادة الربط",
    removingEllipsis: "جارٍ الإزالة…",

    retryFailedToast: "فشلت إعادة المحاولة.",
    retriedRefreshing: "جارٍ إعادة المحاولة — ستتحدث الحالة أدناه تلقائيًا.",
    pickDateTime: "اختر تاريخًا ووقتًا.",
    scheduleUpdated: "تم تحديث الجدولة.",
    couldNotUpdatePost: "تعذّر تحديث المنشور.",
    editScheduledPost: "تعديل المنشور المجدول",
    editDialogDescription: "غيّر موعد النشر أو عدّل النص. الأوقات بتوقيتك المحلي.",
    scheduledTimeLabel: "وقت الجدولة",
    saveChanges: "حفظ التغييرات",
    duplicatePost: "تكرار",
    duplicatedToast: "تم التكرار كمسودة.",
    couldNotDuplicate: "تعذّر تكرار المنشور.",
    deletePostConfirmTitle: "حذف هذا المنشور؟",
    deletePostConfirmDescription:
      "ستُحذف الوسائط المرفوعة وسجل النشر الخاص بها. أما المنشورات التي سبق نشرها على كل منصة فلن تتأثر.",
    keep: "إبقاء",
    deletedToast: "تم الحذف.",
    couldNotDelete: "تعذّر الحذف.",

    filterAll: "الكل",
    filterScheduled: "مجدولة",
    filterPublished: "منشورة",
    filterFailed: "تحتاج انتباهًا",
    filterEmpty: "لا يوجد شيء بهذا الفلتر.",
    liveUpdating: "تحديث مباشر",

    pickAtLeastOnePlatform: "اختر منصة واحدة على الأقل.",
    unauthorized: "غير مصرح به.",
    noPlatformsConnected: "لا توجد أي منصة مختارة متصلة.",
    couldNotCreatePost: "تعذّر إنشاء المنشور.",
    postNotFound: "المنشور غير موجود.",
    onlyScheduledEditable: "يمكن تعديل المنشورات المجدولة فقط.",
    onlyScheduledReschedulable: "يمكن إعادة جدولة المنشورات المجدولة فقط.",
    jobNotFound: "المهمة غير موجودة.",
    tiktokBrandedPrivacyConflict:
      "لا يسمح تيك توك بنشر المحتوى الدعائي (Branded content) بشكل خاص. اختر مستوى خصوصية عامًا لتيك توك، أو أوقف تفعيل إفصاح المحتوى الدعائي.",

    tiktokSettings: {
      heading: "إعدادات تيك توك",
      loading: "جارٍ تحميل بيانات حساب تيك توك…",
      loadFailed: (error: string) => `تعذّر تحميل بيانات حساب تيك توك: ${error}`,
      postingAsPrefix: "النشر باسم",
      postModeLabel: "كيف تريد نشر هذا المحتوى؟",
      postModeDirect: "انشر مباشرةً على ملفي الشخصي",
      postModeDraft: "احفظه كمسودة في صندوق وارد تيك توك",
      postModeDraftHint:
        "يستورد تيك توك الوسائط إلى صندوق الوارد الخاص بك — وتكمل الوصف والخصوصية والإفصاح داخل تطبيق تيك توك.",
      privacyLevelLabel: "مستوى الخصوصية",
      privacyLevelLabelFor: (level: string) => {
        switch (level) {
          case "PUBLIC_TO_EVERYONE":
            return "الجميع";
          case "MUTUAL_FOLLOW_FRIENDS":
            return "الأصدقاء (متابعة متبادلة)";
          case "FOLLOWER_OF_CREATOR":
            return "المتابعون";
          case "SELF_ONLY":
            return "أنا فقط (خاص)";
          default:
            return level;
        }
      },
      disclosureLabel: "إفصاح المحتوى",
      brandedContentLabel: "محتوى دعائي (شراكة مدفوعة)",
      brandOrganicLabel: "محتوى ترويجي خاص بي",
      brandedPrivacyWarning: "لا يمكن نشر المحتوى الدعائي بشكل خاص — اختر مستوى خصوصية عامًا أعلاه.",
      brandedNeedsAuditWarning:
        "يحتاج المحتوى الدعائي إلى جمهور عام، لكن منشورات تيك توك تبقى خاصة هنا حتى تجتاز مراجعة التطبيق — فهذا الخيار غير متاح بعد.",
      autoAddMusicLabel: "دع تيك توك يضيف موسيقى",
      autoAddMusicHint: "لمنشورات الصور فقط — يختار تيك توك مقطعًا من مكتبته.",
      confirmBefore: "أُقرّ بأن لدي حقوق استخدام أي موسيقى مستخدمة وأوافق على ",
      musicUsageLink: "تأكيد استخدام الموسيقى",
      confirmMiddle: " و",
      termsOfServiceLink: "شروط الخدمة",
      confirmAfter: " الخاصة بتيك توك.",
      confirmRequiredError: "أكّد مربع تأكيد استخدام الموسيقى وشروط الخدمة الخاص بتيك توك قبل النشر.",
    },

    pageTour: {
      steps: {
        connectAccounts: {
          title: "اربط حساباتك",
          desc: "اربط إنستغرام أو فيسبوك أو تيك توك أو يوتيوب أو ثريدز قبل النشر.",
        },
        needsAttention: {
          title: "منشورات تحتاج انتباهك",
          desc: "يُبرز أي منشور فشلت إحدى المنصات في نشره، لتتمكن من إعادة المحاولة.",
        },
        composer: {
          title: "أنشئ منشورًا",
          desc: "أضف فيديو أو صورة أو حتى 35 شريحة لألبوم، ثم اختر أين يُنشر.",
        },
        media: {
          title: "الوسائط والألبومات",
          desc: "أفلت عدة ملفات لإنشاء ألبوم، واسحب لإعادة الترتيب، وحدّد شريحة الغلاف.",
        },
        validation: {
          title: "فحوصات قبل النشر",
          desc: "حدود كل منصة الحقيقية تُفحص أثناء الكتابة — فلا يفشل شيء بعد الضغط على النشر.",
        },
        preview: {
          title: "معاينة مباشرة",
          desc: "شاهد كيف سيبدو وصفك والوسوم والوسائط على كل منصة مختارة.",
        },
        history: {
          title: "سجل النشر",
          desc: "كل منشور أرسلته، مع حالة كل منصة، وإجراءات إعادة المحاولة والتكرار والتعديل.",
        },
      },
    },
  },
};
