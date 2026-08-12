// Accounts dictionary domain: `/dashboard/accounts` page + actions, and the
// AccountCard / AccountsFilter / AccountsSearch / AddAccountForm /
// GroupsManager / ImportFollowing components. Composed into the root `Dict`
// by `lib/i18n/dictionaries/index.ts`.
//
// Arabic note: dynamic-count strings (e.g. "Add N accounts") use a single
// invariant plural noun regardless of N — the common, widely-accepted
// simplification in modern software Arabic UI — rather than full classical
// number-noun agreement (which would need a different noun form for 3-10 vs
// 11+ vs exactly 1/2).

const en = {
  accounts: {
    page: {
      title: "Accounts",
      subtitle: "Save inspiration accounts you want ReelSpy to track and score.",
      emptyState: "No inspiration accounts yet. Add your first account above.",
      noMatches: (query: string) => `No accounts match "${query}".`,
      noStatusAccounts: (status: string) => `No ${status} accounts.`,
    },
    filter: {
      all: "All",
      active: "Active",
      paused: "Paused",
    },
    search: {
      placeholder: "Search accounts…",
      clearAria: "Clear search",
    },
    noGroupOption: "No group",
    addForm: {
      usernameLabel: "Instagram Username",
      groupLabel: "Group",
      groupSelectAria: "Group for the new account",
      addButton: "Add Account",
      adding: "Adding...",
      addedToast: (username: string) => `Added @${username}`,
      addedToGroupToast: (username: string, group: string) => `Added @${username} to "${group}"`,
      addFailedToast: "Could not add the account. Please try again.",
    },
    card: {
      pausedBanner: "Paused — hidden from the feed and skipped by syncs",
      followersSuffix: "followers",
      lastSyncLabel: "Last sync:",
      never: "Never",
      groupLabel: "Group",
      groupSelectAria: "Assign group",
      syncSelectAria: "Reels to sync",
      syncButton: "Sync",
      syncing: "Syncing…",
      // Cache-first sync: when the shared snapshot is already current there is
      // nothing to fetch, so say so instead of implying work happened.
      alreadyFreshToast: (username: string) => `@${username} is already up to date.`,
      queuedToast: (username: string) => `Refreshing @${username} in the background…`,
      forceSyncLabel: "Force refresh from Instagram",
      forceSyncTitle:
        "Fetch fresh data from Instagram right now. Uses part of your hourly quota.",
      pauseAria: "Pause account",
      activateAria: "Activate account",
      pauseTitle: "Pause (hide from feed)",
      activateTitle: "Activate (show in feed)",
      resumeLabel: "Resume",
      removeAria: "Remove account",
      removeTitle: "Remove account",
      viewInsightsAria: "View account insights",
      viewInsightsTitle: "Open the full insights page for this account",
      removeConfirmTitle: (username: string) => `Remove @${username}?`,
      removeConfirmDesc: "This also deletes its tracked reels. This can't be undone.",
      movedToGroupToast: (group: string) => `Moved to "${group}"`,
      removedFromGroupToast: "Removed from group",
      groupUpdateError: "Could not update the group.",
      syncResultToast: (username: string, inserted: number, updated: number) =>
        `@${username}: +${inserted} new · ${updated} refreshed`,
      syncFailedToast: "Sync failed.",
      pausedToast: (username: string) => `Paused @${username}`,
      activatedToast: (username: string) => `Activated @${username}`,
      accountUpdateError: "Could not update the account.",
      removedToast: (username: string) => `Removed @${username}`,
      removeError: "Could not remove the account.",
      activeBadge: "Active",
      pausedBadge: "Paused",
    },
    archive: {
      button: "Full history",
      buttonTitle:
        "Pull this account's whole reel history, not just the latest posts. Runs in the background.",
      starting: "Starting…",
      rangeAria: "How far back to pull",
      ranges: {
        "6m": "6 months",
        "12m": "12 months",
        "24m": "2 years",
        all: "Everything",
      },
      // Deliberately never says "instantly": Instagram hands back 25 posts per
      // call, so a deep account is dozens of paced calls. Promising speed we
      // can't deliver is how a working feature gets reported as broken.
      queuedToast: (username: string) =>
        `Pulling @${username}'s history in the background. This can take a few minutes — you can leave this page.`,
      cachedToast: (username: string) => `@${username}'s history is already archived.`,
      runningToast: (username: string) => `@${username} is already being archived.`,
      failedToast: "Could not start the archive.",
      working: (reels: number) => `Archiving… ${reels} reels so far`,
      done: (reels: number) => `${reels} reels archived`,
      backTo: (date: string) => `back to ${date}`,
      fullHistory: "full history",
      // `partial` means the safety ceiling stopped the walk — the archive is
      // real but not complete, and saying so beats implying it's everything.
      partial: (reels: number) => `${reels} reels archived (stopped at our limit)`,
      failed: "Archive failed. Try again, or check the account is still public.",
      exportAria: "Export this account's reels",
      exportTitle: "Download this account's reels",
      exportCsv: "Export CSV",
      exportJson: "Export JSON",
      exportTxt: "Export transcripts as text",
      exportModeAria: "What to include in the export",
      exportModes: {
        metadata: "Metrics only",
        transcripts: "With transcripts",
      },
      transcribe: {
        button: "Transcribe all",
        // Sets the expectation the feature can actually meet: transcription is
        // paced per hour and capped per month, so a big account is a job that
        // runs for days. Saying so up front is cheaper than a support ticket.
        buttonTitle:
          "Transcribe every reel of this account that doesn't have a transcript yet. Runs in the background over hours or days, within your plan's monthly transcript limit.",
        starting: "Starting…",
        queuedToast: (username: string) =>
          `Transcribing @${username}'s reels in the background. This runs for a while — you can leave this page.`,
        runningToast: (username: string) => `@${username}'s reels are already being transcribed.`,
        nothingToast: (username: string) => `Every reel of @${username} is already transcribed.`,
        failedToast: "Could not start transcribing.",
        progress: (ready: number, total: number) => `${ready} of ${total} reels transcribed`,
        working: (ready: number, total: number) => `Transcribing… ${ready} of ${total} reels`,
        // "Paused" rather than "stopped": the job resumes on its own when the
        // limit clears, and the user has nothing to do.
        paused: (remaining: number) =>
          `Paused — ${remaining} reels left. Resumes automatically when your limit resets.`,
        failed: "Transcribing stopped. Try starting it again.",
        skipped: (failed: number) => `${failed} skipped`,
      },
    },
    groups: {
      heading: "Groups",
      hint: "Organize accounts (e.g. Competitors, Inspiration)",
      newGroupPlaceholder: "New group name…",
      addGroup: "Add Group",
      noGroupsYet: "No groups yet. Create one above, then assign accounts.",
      renameHint: "Click to rename",
      deleteAria: (name: string) => `Delete group ${name}`,
      deleteTitle: "Delete group",
      deleteConfirmTitle: (name: string) => `Delete group "${name}"?`,
      deleteConfirmDesc: "Accounts in this group will be ungrouped (not deleted).",
      enterNameError: "Enter a group name.",
      nameExistsError: "A group with that name already exists.",
      createdToast: (name: string) => `Created "${name}"`,
      createError: "Could not create the group.",
      renamedToast: "Group renamed",
      renameError: "Could not rename the group.",
      deletedToast: (name: string) => `Deleted "${name}"`,
      deleteError: "Could not delete the group.",
    },
    import: {
      toggleLabel: "Import accounts you follow",
      toggleHint: "Fill your inspiration list in one go",
      introPart1:
        "Instagram's API doesn't share your following list, but you can import it in seconds: paste usernames below, or upload the",
      introPart2: "file from Instagram's",
      downloadLinkText: "Download your information",
      introPart3: "export. You'll review the list before anything is added.",
      reviewListButton: "Review list",
      uploadButton: "Upload export file",
      noUsernamesFoundError: "No Instagram usernames found in that input.",
      couldNotReadFileError: "Could not read that file.",
      selectedOfTotalSuffix: (total: number) =>
        `of ${total} accounts selected — untick any you don't want.`,
      addToGroupLabel: "Add to group (optional)",
      importingButton: "Importing…",
      addAccountsButton: (count: number) => (count === 1 ? "Add 1 account" : `Add ${count} accounts`),
      addedCountToast: (count: number) => (count === 1 ? "Added 1 account" : `Added ${count} accounts`),
      existingCountToast: (count: number) => `${count} already tracked`,
      invalidCountToast: (count: number) => `${count} invalid skipped`,
      photosBackfillToast: "Profile photos and follower counts will fill in on the first sync.",
      bulkRefreshNotice: (count: number) =>
        `Fetching ${count} accounts in the background. Instagram limits how fast we can pull, so this can take a few minutes — you can leave this page.`,
      importFailedError: "Import failed. Please try again.",
      selectAtLeastOneError: "Select at least one account.",
    },
    actions: {
      unauthorized: "Unauthorized.",
      usernameRequired: "Instagram username is required.",
      invalidUsername: "Usernames can only contain letters, numbers, dots and underscores (max 30).",
      accountLimit: (plan: string, limit: number) =>
        `Your ${plan} plan tracks up to ${limit} accounts. Upgrade in Billing to add more.`,
      groupNotFound: "Group not found.",
      connectInstagramFirst:
        "Connect your Instagram account first (Settings → Instagram) before adding inspiration accounts.",
      accountNotFound: "Account not found or not a Business/Creator account.",
      noUsernamesProvided: "No usernames provided.",
      tooManyUsernames: "That's a lot at once — import up to 300 accounts at a time.",
      noneValidUsernames: "None of those look like valid Instagram usernames.",
      groupNameRequired: "Group name is required.",
      groupNameTooLong: "Group name must be 40 characters or fewer.",
      groupNameExists: "A group with that name already exists.",
      groupIdRequired: "Group id is required.",
      accountIdRequired: "Account id is required.",
    },
    detail: {
      backToAccounts: "All accounts",
      notFoundTitle: "Account not found",
      notFoundDesc: "This account is no longer tracked, or it never belonged to your workspace.",
      openOnInstagram: "Open on Instagram",
      trackingSince: (date: string) => `Tracking since ${date}`,
      approximate: "Approximate",
      approximateHint:
        "Computed from the most recent 400 reels rather than the full history.",
      pausedBanner:
        "This account is paused. It is hidden from your feed and skipped by syncs — the numbers below are from the reels already captured.",
      degraded: "Some panels are unavailable right now. Everything else on this page is live.",
      nav: {
        performance: "Performance",
        patterns: "Patterns",
        content: "Content",
        reels: "Reels",
        activity: "Activity",
        manage: "Manage",
      },
      empty: {
        title: "No reels captured yet",
        desc: "Sync this account to pull its recent reels, or pull the full history to go all the way back.",
        tooFew:
          "Only a handful of reels captured so far — trends and distributions need more data before they mean anything.",
      },
      coverage: {
        reelsTracked: "Reels tracked",
        range: "Covering",
        rangeValue: (from: string, to: string) => `${from} → ${to}`,
        history: "History depth",
        fullHistory: "Full history",
        // A user who pulled a bounded archive (e.g. "12 months") has ORDERS OF
        // MAGNITUDE more reels than a normal sync, but the walk never reached
        // the account's true first post, so it isn't `exhausted` either. Calling
        // that "recent reels only" reads as if only the last sync's ~25-100
        // reels were captured — reserve that phrase for when no archive was
        // ever requested at all.
        extendedHistory: "Extended archive",
        partialHistory: "Recent reels only",
        deeperAvailable: "Deeper history available",
        never: "Never",
      },
      kpi: {
        medianViews: "Median views",
        medianViewsHint:
          "The typical post. Used instead of the average because a single viral reel makes the average meaningless.",
        avgViews: "Average views",
        avgViewsHint: "Skewed upward by outliers — compare it to the median.",
        engagementRate: "Engagement rate",
        engagementRateHint: "(Likes + comments) ÷ views, across every captured reel.",
        perFollower: "Views per follower",
        perFollowerHint:
          "Median views ÷ current followers. Above 1.0 means their reels routinely reach beyond their own audience.",
        byFollowers: "Engagement / followers",
        byFollowersHint:
          "Average interactions ÷ current follower count. Applies today's follower number to posts of every age.",
        outlier: "Best vs typical",
        outlierHint: "Their best reel divided by their median reel.",
        hitRate: "Breakout rate",
        hitRateHint: "Share of reels that beat 3× the median.",
        commentShare: "Comment share",
        commentShareHint:
          "Comments as a share of all interactions. High means the content starts conversations rather than collecting passive likes.",
        commentsOfInteractions: (comments: string, interactions: string) =>
          `${comments} comments of ${interactions} interactions`,
        postsPerWeek: "Posts per week",
        followers: "Followers",
        times: (value: string) => `${value}×`,
      },
      performance: {
        title: "Performance",
        growth: "Follower growth",
        growthHint: "Tracked once per day",
        growthStarting:
          "Growth history starts from today — a chart appears once this account has been synced on more than one day.",
        growthDelta: (value: string, days: number) => `${value} over ${days} days`,
        timeline: "Views per reel",
        timelineHint: "by post date",
        distribution: "How views are distributed",
        distributionHint: "reels per view range",
        trend: "Recent vs prior",
        trendHint: "mature posts only",
        trendExplainer:
          "Both windows exclude the last 30 days, so every reel compared has had the same time to accumulate views. Without that, recent posts always look like a decline.",
        trendInsufficient: "Not enough mature posts on either side of the window yet.",
        recentWindow: "Recent 30 days",
        priorWindow: "Previous 30 days",
        postsCount: (n: number) => `${n} reels`,
      },
      patterns: {
        title: "Posting patterns",
        bestDay: "Median views by weekday",
        bestDayHint: "days with under 3 posts are dimmed",
        strongestDay: (day: string) => `${day} is their strongest day.`,
        weekdayTooltip: (day: string, value: string, count: number) =>
          `${day}: ${value} median views across ${count} reels`,
        heatmap: "When they post",
        heatmapHint: "median views by day and hour",
        heatmapCell: (day: string, hour: string, value: string, count: number) =>
          `${day} ${hour} — ${count} reels, ${value} median views`,
        timezoneLocal: "Your time",
        timezoneUtc: "UTC",
        timezoneNote:
          "Shown in your timezone. The audience's timezone is unknown, so treat this as when they post, not when you should.",
        cadence: "Cadence",
        postsPerWeek: "Posts per week",
        medianGap: "Typical gap",
        longestGap: "Longest silence",
        sinceLast: "Since last post",
        streak: "Active weeks",
        streakValue: (active: number, total: number) => `${active} of ${total}`,
        days: (n: string) => `${n} days`,
        dormant: "Dormant",
        dormantHint: "No new reel in over 30 days.",
      },
      content: {
        title: "Content",
        topPerformers: "Best performing",
        topHint: "by views",
        weakest: "Weakest performing",
        weakestHint: "excludes reels with no view data",
        outperformers: "Outperforming their own median",
        outperformersHint: "ranked by how far above their typical reel",
        hashtags: "Hashtags",
        hashtagsHint: "most used, with median views",
        mentions: "Mentions & collabs",
        captionLength: "Caption length vs views",
        captionShort: "Under 50",
        captionMedium: "50–150",
        captionLong: "150–300",
        captionEssay: "300+",
        captionChars: "characters",
        transcripts: "Transcript coverage",
        transcriptsValue: (ready: number, total: number) => `${ready} of ${total} reels`,
        transcriptsFailed: (n: number) => `${n} failed`,
        noCaptions: "No hashtag this account reuses across multiple reels yet.",
        reelsUsing: (n: number) => (n === 1 ? "1 reel" : `${n} reels`),
      },
      reels: {
        title: "Latest reels",
        seeAll: "See all in Feed",
      },
      activity: {
        title: "Your activity",
        subtitle: "Everything you have done with this account inside ReelSpy.",
        empty: "Nothing recorded yet. Syncing or archiving this account will show up here.",
        showMore: "Show more",
        kinds: {
          account_tracked: "Started tracking this account",
          reels_added: (n: number) => `${n} reels captured`,
          synced: "Synced",
          sync_throttled: "Sync throttled by the hourly quota",
          archive_requested: "Requested full history",
          archive_completed: (n: number) => `Full history imported — ${n} reels`,
          // A bulk-transcription run resumes itself in chunks across quota
          // resets, so one click can leave several "started" moments in the
          // same day — the count says that plainly instead of implying the
          // user clicked the button N times.
          transcribe_started: (n: number) =>
            n > 1 ? `Started transcribing every reel — ${n} runs` : "Started transcribing every reel",
          transcribe_failed: "Bulk transcription failed",
          transcripts_ready: (n: number) => `${n} transcripts finished`,
          reel_favorited: "Saved a reel",
          reel_worked: "Marked a reel as worked on",
          reel_discarded: "Discarded a reel",
          script_generated: "Generated a script",
          exported: "Exported data",
          paused: "Paused the account",
          resumed: "Resumed the account",
          group_changed: "Changed the group",
        },
      },
      manage: {
        title: "Manage",
        subtitle: "Sync depth, full history, transcripts and exports for this account.",
        groupLabel: "Group",
        removeHeading: "Remove account",
        removeDesc:
          "Stops tracking and deletes every captured reel for this account. Scripts you already generated are kept.",
      },
    },
    detailTour: {
      steps: {
        kpis: {
          title: "The six numbers first",
          desc: "Median views leads, not the average — one viral reel makes an average meaningless. Hover any card for what it measures.",
        },
        coverage: {
          title: "What we actually know",
          desc: "How many reels are captured and the date range they cover, so a number from 40 recent reels is never mistaken for the account's whole history.",
        },
        performance: {
          title: "Performance over time",
          desc: "Follower growth, views per reel, and how views are distributed. The recent-vs-prior comparison only uses posts old enough to have finished accumulating views.",
        },
        patterns: {
          title: "When they post",
          desc: "Weekday medians and an hour-by-hour heatmap in your timezone, plus their posting cadence and longest silence.",
        },
        content: {
          title: "What works for them",
          desc: "Best and weakest reels, hashtag performance, caption length vs views, and how much of the account you have transcripts for.",
        },
        activity: {
          title: "Your own history",
          desc: "Every sync, archive, transcription and save you've made on this account, newest first.",
        },
      },
    },
    pageTour: {
      steps: {
        addAccount: {
          title: "Track a new account",
          desc: "Add any public Instagram account by username to start tracking its reels.",
        },
        importFollowing: {
          title: "Bulk import",
          desc: "Import everyone you already follow on Instagram in one click.",
        },
        groups: {
          title: "Organize with groups",
          desc: "Group accounts (e.g. by niche or client) to filter the feed later.",
        },
        filterBar: {
          title: "Filter & search",
          desc: "Switch between All / Active / Paused accounts or search by username.",
        },
        cards: {
          title: "Account cards",
          desc: "Each card shows sync status and follower count, and lets you pause, rename group, or remove.",
        },
      },
    },
  },
};

export type AccountsDict = typeof en;
export const accountsEn = en;

export const accountsAr: AccountsDict = {
  accounts: {
    page: {
      title: "الحسابات",
      subtitle: "احفظ حسابات الإلهام التي تريد أن يتابعها ReelSpy ويقيّم أداءها.",
      emptyState: "لا توجد حسابات إلهام بعد. أضف أول حساب أعلاه.",
      noMatches: (query: string) => `لا توجد حسابات مطابقة لـ«${query}».`,
      noStatusAccounts: (status: string) => `لا توجد حسابات ${status}.`,
    },
    filter: {
      all: "الكل",
      active: "نشطة",
      paused: "متوقفة",
    },
    search: {
      placeholder: "ابحث في الحسابات…",
      clearAria: "مسح البحث",
    },
    noGroupOption: "بلا مجموعة",
    addForm: {
      usernameLabel: "اسم مستخدم إنستغرام",
      groupLabel: "المجموعة",
      groupSelectAria: "مجموعة الحساب الجديد",
      addButton: "إضافة حساب",
      adding: "جارٍ الإضافة...",
      addedToast: (username: string) => `تمت إضافة @${username}`,
      addedToGroupToast: (username: string, group: string) => `تمت إضافة @${username} إلى «${group}»`,
      addFailedToast: "تعذّرت إضافة الحساب. يرجى المحاولة مرة أخرى.",
    },
    card: {
      pausedBanner: "متوقف — مخفي من المحتوى ويتم تجاوزه في المزامنة",
      followersSuffix: "متابع",
      lastSyncLabel: "آخر مزامنة:",
      never: "لم تتم أبدًا",
      groupLabel: "المجموعة",
      groupSelectAria: "تعيين المجموعة",
      syncSelectAria: "عدد الريلز للمزامنة",
      syncButton: "مزامنة",
      syncing: "جارٍ المزامنة…",
      alreadyFreshToast: (username: string) => `@${username} محدَّث بالفعل.`,
      queuedToast: (username: string) => `جارٍ تحديث @${username} في الخلفية…`,
      forceSyncLabel: "تحديث فوري من إنستغرام",
      forceSyncTitle: "جلب بيانات جديدة من إنستغرام الآن. يستهلك جزءًا من حصتك بالساعة.",
      pauseAria: "إيقاف الحساب",
      activateAria: "تفعيل الحساب",
      pauseTitle: "إيقاف (إخفاء من المحتوى)",
      activateTitle: "تفعيل (إظهار في المحتوى)",
      resumeLabel: "استئناف",
      removeAria: "إزالة الحساب",
      removeTitle: "إزالة الحساب",
      viewInsightsAria: "عرض تحليلات الحساب",
      viewInsightsTitle: "افتح صفحة التحليلات الكاملة لهذا الحساب",
      removeConfirmTitle: (username: string) => `إزالة @${username}؟`,
      removeConfirmDesc: "سيؤدي هذا أيضًا إلى حذف الريلز المتابَعة الخاصة به. لا يمكن التراجع عن هذا الإجراء.",
      movedToGroupToast: (group: string) => `تم النقل إلى «${group}»`,
      removedFromGroupToast: "تمت الإزالة من المجموعة",
      groupUpdateError: "تعذّر تحديث المجموعة.",
      syncResultToast: (username: string, inserted: number, updated: number) =>
        `@${username}: +${inserted} جديد · ${updated} محدَّث`,
      syncFailedToast: "فشلت المزامنة.",
      pausedToast: (username: string) => `تم إيقاف @${username}`,
      activatedToast: (username: string) => `تم تفعيل @${username}`,
      accountUpdateError: "تعذّر تحديث الحساب.",
      removedToast: (username: string) => `تمت إزالة @${username}`,
      removeError: "تعذّرت إزالة الحساب.",
      activeBadge: "نشط",
      pausedBadge: "متوقف",
    },
    archive: {
      button: "السجل الكامل",
      buttonTitle:
        "اسحب سجل الريلز الكامل لهذا الحساب، وليس أحدث المنشورات فقط. يعمل في الخلفية.",
      starting: "جارٍ البدء…",
      rangeAria: "إلى أي مدى زمني نعود",
      ranges: {
        "6m": "٦ أشهر",
        "12m": "١٢ شهرًا",
        "24m": "سنتان",
        all: "كل شيء",
      },
      queuedToast: (username: string) =>
        `جارٍ سحب سجل @${username} في الخلفية. قد يستغرق ذلك بضع دقائق — يمكنك مغادرة هذه الصفحة.`,
      cachedToast: (username: string) => `سجل @${username} مؤرشف بالفعل.`,
      runningToast: (username: string) => `تتم أرشفة @${username} بالفعل.`,
      failedToast: "تعذّر بدء الأرشفة.",
      working: (reels: number) => `جارٍ الأرشفة… ${reels} ريلز حتى الآن`,
      done: (reels: number) => `تمت أرشفة ${reels} ريلز`,
      backTo: (date: string) => `حتى ${date}`,
      fullHistory: "السجل الكامل",
      partial: (reels: number) => `تمت أرشفة ${reels} ريلز (توقفنا عند الحد الأقصى)`,
      failed: "فشلت الأرشفة. حاول مرة أخرى، أو تأكد من أن الحساب ما زال عامًا.",
      exportAria: "تصدير ريلز هذا الحساب",
      exportTitle: "تنزيل ريلز هذا الحساب",
      exportCsv: "تصدير CSV",
      exportJson: "تصدير JSON",
      exportTxt: "تصدير النصوص كملف نصي",
      exportModeAria: "ما الذي يتضمنه التصدير",
      exportModes: {
        metadata: "الأرقام فقط",
        transcripts: "مع النصوص",
      },
      transcribe: {
        button: "تفريغ الكل",
        buttonTitle:
          "فرّغ نص كل ريل في هذا الحساب لا يملك نصًا بعد. يعمل في الخلفية على مدى ساعات أو أيام، ضمن حد التفريغ الشهري في باقتك.",
        starting: "جارٍ البدء…",
        queuedToast: (username: string) =>
          `جارٍ تفريغ نصوص ريلز @${username} في الخلفية. تستغرق العملية وقتًا — يمكنك مغادرة هذه الصفحة.`,
        runningToast: (username: string) => `يجري بالفعل تفريغ نصوص ريلز @${username}.`,
        nothingToast: (username: string) => `كل ريلز @${username} مفرّغة بالفعل.`,
        failedToast: "تعذّر بدء التفريغ.",
        progress: (ready: number, total: number) => `تم تفريغ ${ready} من ${total} ريلز`,
        working: (ready: number, total: number) => `جارٍ التفريغ… ${ready} من ${total} ريلز`,
        paused: (remaining: number) =>
          `متوقف مؤقتًا — بقي ${remaining} ريلز. سيُستأنف تلقائيًا عند تجدد حدّك.`,
        failed: "توقف التفريغ. حاول بدءه مرة أخرى.",
        skipped: (failed: number) => `${failed} متخطاة`,
      },
    },
    groups: {
      heading: "المجموعات",
      hint: "نظّم الحسابات (مثال: المنافسون، الإلهام)",
      newGroupPlaceholder: "اسم مجموعة جديدة…",
      addGroup: "إضافة مجموعة",
      noGroupsYet: "لا توجد مجموعات بعد. أنشئ واحدة أعلاه، ثم عيّن الحسابات إليها.",
      renameHint: "انقر لإعادة التسمية",
      deleteAria: (name: string) => `حذف مجموعة ${name}`,
      deleteTitle: "حذف المجموعة",
      deleteConfirmTitle: (name: string) => `حذف مجموعة «${name}»؟`,
      deleteConfirmDesc: "ستُصبح حسابات هذه المجموعة بلا مجموعة (لن تُحذف).",
      enterNameError: "أدخل اسم المجموعة.",
      nameExistsError: "توجد بالفعل مجموعة بهذا الاسم.",
      createdToast: (name: string) => `تم إنشاء «${name}»`,
      createError: "تعذّر إنشاء المجموعة.",
      renamedToast: "تمت إعادة تسمية المجموعة",
      renameError: "تعذّرت إعادة تسمية المجموعة.",
      deletedToast: (name: string) => `تم حذف «${name}»`,
      deleteError: "تعذّر حذف المجموعة.",
    },
    import: {
      toggleLabel: "استيراد الحسابات التي تتابعها",
      toggleHint: "املأ قائمة إلهامك دفعة واحدة",
      introPart1:
        "لا تشارك واجهة برمجة إنستغرام قائمة متابَعاتك، لكن يمكنك استيرادها خلال ثوانٍ: الصق أسماء المستخدمين أدناه، أو ارفع ملف",
      introPart2: "من تصدير",
      downloadLinkText: "تنزيل بياناتك",
      introPart3: "من إنستغرام. ستراجع القائمة قبل إضافة أي شيء.",
      reviewListButton: "مراجعة القائمة",
      uploadButton: "رفع ملف التصدير",
      noUsernamesFoundError: "لم يتم العثور على أي أسماء مستخدمين على إنستغرام في هذا الإدخال.",
      couldNotReadFileError: "تعذّرت قراءة هذا الملف.",
      selectedOfTotalSuffix: (total: number) => `من ${total} حساب محدد — ألغِ تحديد ما لا تريده.`,
      addToGroupLabel: "إضافة إلى مجموعة (اختياري)",
      importingButton: "جارٍ الاستيراد…",
      addAccountsButton: (count: number) => (count === 1 ? "إضافة حساب واحد" : `إضافة ${count} حسابات`),
      addedCountToast: (count: number) => (count === 1 ? "تمت إضافة حساب واحد" : `تمت إضافة ${count} حسابات`),
      existingCountToast: (count: number) => `${count} متابَع بالفعل`,
      invalidCountToast: (count: number) => `${count} غير صالح تم تجاهله`,
      photosBackfillToast: "ستُستكمل الصور الشخصية وأعداد المتابعين تلقائيًا عند أول مزامنة.",
      bulkRefreshNotice: (count: number) =>
        `جارٍ جلب ${count} حساب في الخلفية. يحدّ إنستغرام من سرعة الجلب، لذا قد يستغرق ذلك بضع دقائق — يمكنك مغادرة هذه الصفحة.`,
      importFailedError: "فشل الاستيراد. يرجى المحاولة مرة أخرى.",
      selectAtLeastOneError: "اختر حسابًا واحدًا على الأقل.",
    },
    actions: {
      unauthorized: "غير مصرَّح.",
      usernameRequired: "اسم مستخدم إنستغرام مطلوب.",
      invalidUsername: "يمكن أن تحتوي أسماء المستخدمين على أحرف وأرقام ونقاط وشرطات سفلية فقط (بحد أقصى 30 حرفًا).",
      accountLimit: (plan: string, limit: number) =>
        `باقتك ${plan} تتيح متابعة حتى ${limit} حساب. قم بالترقية من صفحة الفوترة لإضافة المزيد.`,
      groupNotFound: "المجموعة غير موجودة.",
      connectInstagramFirst: "اربط حساب إنستغرام أولًا (الإعدادات ← إنستغرام) قبل إضافة حسابات الإلهام.",
      accountNotFound: "لم يتم العثور على الحساب أو أنه ليس حساب أعمال/منشئ محتوى.",
      noUsernamesProvided: "لم يتم إدخال أي أسماء مستخدمين.",
      tooManyUsernames: "هذا عدد كبير دفعة واحدة — يمكنك استيراد حتى 300 حساب في كل مرة.",
      noneValidUsernames: "لا يبدو أي من هذه أسماء مستخدمين صالحة على إنستغرام.",
      groupNameRequired: "اسم المجموعة مطلوب.",
      groupNameTooLong: "يجب ألا يتجاوز اسم المجموعة 40 حرفًا.",
      groupNameExists: "توجد بالفعل مجموعة بهذا الاسم.",
      groupIdRequired: "معرّف المجموعة مطلوب.",
      accountIdRequired: "معرّف الحساب مطلوب.",
    },
    detail: {
      backToAccounts: "كل الحسابات",
      notFoundTitle: "الحساب غير موجود",
      notFoundDesc: "لم يعد هذا الحساب متتبَّعًا، أو أنه لم يكن ضمن مساحة عملك أصلًا.",
      openOnInstagram: "فتح في إنستغرام",
      trackingSince: (date: string) => `تتم متابعته منذ ${date}`,
      approximate: "تقريبي",
      approximateHint: "محسوب من آخر 400 ريل وليس من السجل الكامل.",
      pausedBanner:
        "هذا الحساب متوقف. لا يظهر في المحتوى ويتم تخطيه في المزامنة — الأرقام أدناه من الريلات المحفوظة سابقًا.",
      degraded: "بعض اللوحات غير متاحة حاليًا. باقي محتوى الصفحة محدَّث.",
      nav: {
        performance: "الأداء",
        patterns: "الأنماط",
        content: "المحتوى",
        reels: "الريلات",
        activity: "النشاط",
        manage: "الإدارة",
      },
      empty: {
        title: "لا توجد ريلات محفوظة بعد",
        desc: "زامن هذا الحساب لجلب أحدث ريلاته، أو اسحب السجل الكامل للرجوع إلى البداية.",
        tooFew: "عدد الريلات المحفوظة قليل جدًا — تحتاج المؤشرات والتوزيعات إلى بيانات أكثر لتكون ذات معنى.",
      },
      coverage: {
        reelsTracked: "الريلات المتتبَّعة",
        range: "التغطية",
        rangeValue: (from: string, to: string) => `${from} ← ${to}`,
        history: "عمق السجل",
        fullHistory: "السجل الكامل",
        extendedHistory: "أرشيف موسّع",
        partialHistory: "أحدث الريلات فقط",
        deeperAvailable: "يتوفر سجل أقدم",
        never: "أبدًا",
      },
      kpi: {
        medianViews: "وسيط المشاهدات",
        medianViewsHint:
          "الريل المعتاد. نستخدم الوسيط بدل المتوسط لأن ريلًا واحدًا منتشرًا يجعل المتوسط بلا معنى.",
        avgViews: "متوسط المشاهدات",
        avgViewsHint: "يرتفع بسبب القيم الشاذة — قارنه بالوسيط.",
        engagementRate: "معدل التفاعل",
        engagementRateHint: "(الإعجابات + التعليقات) ÷ المشاهدات لكل الريلات المحفوظة.",
        perFollower: "المشاهدات لكل متابع",
        perFollowerHint:
          "وسيط المشاهدات ÷ عدد المتابعين الحالي. تجاوز 1.0 يعني أن ريلاتهم تصل عادةً إلى خارج جمهورهم.",
        byFollowers: "التفاعل / المتابعون",
        byFollowersHint:
          "متوسط التفاعلات ÷ عدد المتابعين الحالي. يطبّق رقم المتابعين اليوم على منشورات من كل الأعمار.",
        outlier: "الأفضل مقابل المعتاد",
        outlierHint: "أفضل ريل لديهم مقسومًا على الريل الوسيط.",
        hitRate: "معدل الانتشار",
        hitRateHint: "نسبة الريلات التي تجاوزت 3 أضعاف الوسيط.",
        commentShare: "حصة التعليقات",
        commentShareHint:
          "التعليقات كنسبة من كل التفاعلات. النسبة العالية تعني محتوى يثير النقاش لا مجرد إعجابات عابرة.",
        commentsOfInteractions: (comments: string, interactions: string) =>
          `${comments} تعليق من ${interactions} تفاعل`,
        postsPerWeek: "منشورات أسبوعيًا",
        followers: "المتابعون",
        times: (value: string) => `${value}×`,
      },
      performance: {
        title: "الأداء",
        growth: "نمو المتابعين",
        growthHint: "يُسجَّل مرة يوميًا",
        growthStarting:
          "يبدأ سجل النمو من اليوم — سيظهر الرسم البياني بعد مزامنة هذا الحساب في أكثر من يوم.",
        growthDelta: (value: string, days: number) => `${value} خلال ${days} يومًا`,
        timeline: "المشاهدات لكل ريل",
        timelineHint: "حسب تاريخ النشر",
        distribution: "توزيع المشاهدات",
        distributionHint: "عدد الريلات في كل نطاق",
        trend: "الحديث مقابل السابق",
        trendHint: "المنشورات الناضجة فقط",
        trendExplainer:
          "تستثني الفترتان آخر 30 يومًا، فتكون كل الريلات المقارَنة قد أخذت الوقت نفسه لتجميع المشاهدات. بدون ذلك تبدو المنشورات الحديثة دائمًا كأنها تراجع.",
        trendInsufficient: "لا توجد منشورات ناضجة كافية على طرفي الفترة بعد.",
        recentWindow: "آخر 30 يومًا",
        priorWindow: "الـ30 يومًا السابقة",
        postsCount: (n: number) => `${n} ريل`,
      },
      patterns: {
        title: "أنماط النشر",
        bestDay: "وسيط المشاهدات حسب اليوم",
        bestDayHint: "الأيام التي تقل عن 3 منشورات باهتة",
        strongestDay: (day: string) => `${day} هو أقوى أيامهم.`,
        weekdayTooltip: (day: string, value: string, count: number) =>
          `${day}: ${value} وسيط المشاهدات عبر ${count} ريل`,
        heatmap: "متى ينشرون",
        heatmapHint: "وسيط المشاهدات حسب اليوم والساعة",
        heatmapCell: (day: string, hour: string, value: string, count: number) =>
          `${day} ${hour} — ${count} ريل، ${value} وسيط المشاهدات`,
        timezoneLocal: "توقيتك",
        timezoneUtc: "التوقيت العالمي",
        timezoneNote:
          "معروض بتوقيتك أنت. توقيت جمهورهم غير معروف، فاعتبر هذا وقت نشرهم لا الوقت الذي يجب أن تنشر فيه.",
        cadence: "الوتيرة",
        postsPerWeek: "منشورات أسبوعيًا",
        medianGap: "الفاصل المعتاد",
        longestGap: "أطول انقطاع",
        sinceLast: "منذ آخر منشور",
        streak: "الأسابيع النشطة",
        streakValue: (active: number, total: number) => `${active} من ${total}`,
        days: (n: string) => `${n} يوم`,
        dormant: "خامل",
        dormantHint: "لا يوجد ريل جديد منذ أكثر من 30 يومًا.",
      },
      content: {
        title: "المحتوى",
        topPerformers: "الأفضل أداءً",
        topHint: "حسب المشاهدات",
        weakest: "الأضعف أداءً",
        weakestHint: "يستثني الريلات بلا بيانات مشاهدة",
        outperformers: "تجاوزت وسيطهم الخاص",
        outperformersHint: "مرتبة حسب مقدار تجاوزها للريل المعتاد",
        hashtags: "الوسوم",
        hashtagsHint: "الأكثر استخدامًا مع وسيط المشاهدات",
        mentions: "الإشارات والتعاونات",
        captionLength: "طول الوصف مقابل المشاهدات",
        captionShort: "أقل من 50",
        captionMedium: "50–150",
        captionLong: "150–300",
        captionEssay: "300+",
        captionChars: "حرفًا",
        transcripts: "تغطية النصوص",
        transcriptsValue: (ready: number, total: number) => `${ready} من ${total} ريل`,
        transcriptsFailed: (n: number) => `${n} فشلت`,
        noCaptions: "لا يوجد وسم يكرره هذا الحساب عبر أكثر من ريل حتى الآن.",
        reelsUsing: (n: number) => `${n} ريل`,
      },
      reels: {
        title: "أحدث الريلات",
        seeAll: "عرض الكل في المحتوى",
      },
      activity: {
        title: "نشاطك",
        subtitle: "كل ما قمت به مع هذا الحساب داخل ReelSpy.",
        empty: "لا يوجد نشاط مسجَّل بعد. ستظهر هنا عمليات المزامنة والأرشفة.",
        showMore: "عرض المزيد",
        kinds: {
          account_tracked: "بدأت متابعة هذا الحساب",
          reels_added: (n: number) => `تم حفظ ${n} ريل`,
          synced: "تمت المزامنة",
          sync_throttled: "تم تقييد المزامنة بسبب الحصة الساعية",
          archive_requested: "طلبت السجل الكامل",
          archive_completed: (n: number) => `تم استيراد السجل الكامل — ${n} ريل`,
          transcribe_started: (n: number) =>
            n > 1 ? `بدأت تفريغ كل الريلات — ${n} مرات` : "بدأت تفريغ كل الريلات",
          transcribe_failed: "فشل التفريغ الجماعي",
          transcripts_ready: (n: number) => `اكتمل ${n} نص`,
          reel_favorited: "حفظت ريلًا",
          reel_worked: "وضعت علامة «تم العمل عليه» على ريل",
          reel_discarded: "استبعدت ريلًا",
          script_generated: "أنشأت نصًا",
          exported: "صدّرت البيانات",
          paused: "أوقفت الحساب",
          resumed: "استأنفت الحساب",
          group_changed: "غيّرت المجموعة",
        },
      },
      manage: {
        title: "الإدارة",
        subtitle: "عمق المزامنة والسجل الكامل والنصوص والتصدير لهذا الحساب.",
        groupLabel: "المجموعة",
        removeHeading: "إزالة الحساب",
        removeDesc:
          "يوقف المتابعة ويحذف كل ريل محفوظ لهذا الحساب. تبقى النصوص التي أنشأتها سابقًا.",
      },
    },
    detailTour: {
      steps: {
        kpis: {
          title: "الأرقام الستة أولًا",
          desc: "الوسيط هو الأساس وليس المتوسط — ريل واحد منتشر يفقد المتوسط معناه. مرّر فوق أي بطاقة لمعرفة ما تقيسه.",
        },
        coverage: {
          title: "ما نعرفه فعلًا",
          desc: "عدد الريلات المحفوظة والمدة التي تغطيها، حتى لا يُفهم رقم مبني على 40 ريلًا حديثًا على أنه سجل الحساب كامل.",
        },
        performance: {
          title: "الأداء عبر الزمن",
          desc: "نمو المتابعين والمشاهدات لكل ريل وتوزيعها. مقارنة الحديث بالسابق تستخدم فقط المنشورات التي أخذت وقتها الكافي لتجميع المشاهدات.",
        },
        patterns: {
          title: "متى ينشرون",
          desc: "وسيط المشاهدات حسب اليوم وخريطة حرارية بالساعات بتوقيتك، مع وتيرة النشر وأطول انقطاع.",
        },
        content: {
          title: "ما ينجح معهم",
          desc: "أفضل وأضعف الريلات، وأداء الوسوم، وطول الوصف مقابل المشاهدات، ونسبة التفريغ النصي المتوفرة.",
        },
        activity: {
          title: "سجلك أنت",
          desc: "كل مزامنة وأرشفة وتفريغ وحفظ قمت به على هذا الحساب، من الأحدث إلى الأقدم.",
        },
      },
    },
    pageTour: {
      steps: {
        addAccount: {
          title: "تتبع حساب جديد",
          desc: "أضف أي حساب إنستغرام عام باسم المستخدم لبدء تتبع ريلاته.",
        },
        importFollowing: {
          title: "استيراد جماعي",
          desc: "استورد كل من تتابعهم على إنستغرام بنقرة واحدة.",
        },
        groups: {
          title: "نظّم باستخدام المجموعات",
          desc: "جمّع الحسابات (حسب المجال أو العميل مثلًا) لتصفية المحتوى لاحقًا.",
        },
        filterBar: {
          title: "التصفية والبحث",
          desc: "بدّل بين الكل / نشطة / متوقفة أو ابحث باسم المستخدم.",
        },
        cards: {
          title: "بطاقات الحسابات",
          desc: "تعرض كل بطاقة حالة المزامنة وعدد المتابعين، وتتيح لك الإيقاف أو تغيير المجموعة أو الإزالة.",
        },
      },
    },
  },
};
