// Trends dictionary domain (Niche Radar nav section): cross-user aggregate
// intel showing what's outperforming in a content niche, plus the "track this
// account" action. Composed into the root `Dict` by
// `lib/i18n/dictionaries/index.ts`.

const en = {
  trends: {
    page: {
      title: "Niche Radar",
      subtitle:
        "What's over-performing right now across every ReelSpy user's tracked accounts — ranked relative to each account's own baseline, so a rising niche account can beat a giant one. Anonymized aggregate intelligence.",
      emptyTitle: "Nothing trending here yet",
      emptyDesc:
        "The radar fills in as accounts are tracked and synced across the userbase. Track more accounts and check back — recent over-performers will surface here.",
    },
    picker: {
      ariaLabel: "Niche",
      allNiches: "All niches",
    },
    card: {
      followers: "followers",
      noThumbnail: "No thumbnail",
      outperformTitle: (username: string, ratio: string) =>
        `Beats @${username}'s typical reel by ${ratio} vs the account's median`,
      today: "today",
      daysAgo: (d: number) => (d === 1 ? "1d ago" : `${d}d ago`),
    },
    track: {
      tracking: "Tracking",
      adding: "Adding…",
      trackingToast: (username: string) => `Tracking @${username}`,
      invalidUsername: "That doesn't look like a valid Instagram username.",
      unauthorized: "Unauthorized.",
      planLimit: (cap: number, planName: string) =>
        `Your ${planName} plan tracks up to ${cap} accounts. Upgrade in Billing to add more.`,
    },
    pageTour: {
      steps: {
        nichePicker: {
          title: "Pick a niche",
          desc: "See what's over-performing across every ReelSpy user's tracked accounts in a specific niche.",
        },
        trendReels: {
          title: "Trending reels",
          desc: "Cross-user, anonymized reels currently outperforming in this niche.",
        },
      },
    },
  },
};

export type TrendsDict = typeof en;
export const trendsEn = en;

export const trendsAr: TrendsDict = {
  trends: {
    page: {
      title: "رادار المجال",
      subtitle:
        "ما يتفوق أداؤه الآن عبر جميع الحسابات التي يتابعها مستخدمو ReelSpy — مرتّبًا وفق أداء كل حساب مقارنة بمستواه المعتاد، بحيث يمكن لحساب صغير في مجاله أن يتفوق على حساب ضخم. ذكاء تجميعي مجهول الهوية.",
      emptyTitle: "لا يوجد شيء رائج هنا بعد",
      emptyDesc:
        "يمتلئ الرادار تدريجيًا مع تتبع الحسابات ومزامنتها عبر قاعدة المستخدمين. تابع المزيد من الحسابات وعد لاحقًا — ستظهر هنا أحدث الحسابات المتفوقة في الأداء.",
    },
    picker: {
      ariaLabel: "المجال",
      allNiches: "جميع المجالات",
    },
    card: {
      followers: "متابع",
      noThumbnail: "لا توجد صورة مصغّرة",
      outperformTitle: (username: string, ratio: string) =>
        `يتفوّق على أداء @${username} المعتاد بمقدار ${ratio} مقارنة بالوسيط الخاص بالحساب`,
      today: "اليوم",
      daysAgo: (d: number) => {
        if (d === 1) return "منذ يوم";
        if (d === 2) return "منذ يومين";
        if (d >= 3 && d <= 10) return `منذ ${d} أيام`;
        return `منذ ${d} يومًا`;
      },
    },
    track: {
      tracking: "قيد المتابعة",
      adding: "جارٍ الإضافة…",
      trackingToast: (username: string) => `تم تتبع @${username}`,
      invalidUsername: "هذا لا يبدو اسم مستخدم إنستغرام صالحًا.",
      unauthorized: "غير مصرّح.",
      planLimit: (cap: number, planName: string) =>
        `تتيح باقة ${planName} تتبع حتى ${cap} حساب. رقّي باقتك من صفحة الاشتراك لإضافة المزيد.`,
    },
    pageTour: {
      steps: {
        nichePicker: {
          title: "اختر مجالًا",
          desc: "شاهد ما يتفوق أداؤه عبر جميع الحسابات التي يتابعها مستخدمو ReelSpy في مجال معيّن.",
        },
        trendReels: {
          title: "الريلز الرائجة",
          desc: "ريلز مجهولة الهوية من مستخدمين آخرين، تتفوق حاليًا في هذا المجال.",
        },
      },
    },
  },
};
