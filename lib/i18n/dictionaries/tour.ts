// Product tour dictionary domain (driver.js — components/tour/AppTour.tsx,
// lib/tour/steps.ts). `progress` uses driver.js's own `{{current}}`/`{{total}}`
// placeholder tokens verbatim — driver.js does the substitution, not us.
// Composed into the root `Dict` by lib/i18n/dictionaries/index.ts.

const en = {
  tour: {
    next: "Next",
    prev: "Back",
    done: "Done",
    progress: "{{current}} of {{total}}",
    takeTour: "Take a tour",
    pageHelp: "Take a tour of this page",
    inviteTitle: "New here? Take a 60-second tour",
    inviteAction: "Take the tour",
    inviteDismiss: "No thanks",
    steps: {
      accounts: {
        title: "Track accounts",
        desc: "Add creators in your niche whose reels you want to learn from.",
      },
      trends: {
        title: "Niche Radar",
        desc: "See what's over-performing right now across every ReelSpy user's tracked accounts.",
      },
      feed: {
        title: "Your feed",
        desc: "Every synced reel from your tracked accounts, ranked by performance.",
      },
      scripts: {
        title: "Scripts",
        desc: "Turn any reel into an original script written in your own voice.",
      },
      myIg: {
        title: "My Instagram",
        desc: "Your own account's insights, once connected.",
      },
      menu: {
        title: "Menu",
        desc: "Everything ReelSpy does lives behind this button — accounts, feed, scripts, and more.",
      },
      quickActions: {
        title: "Quick actions",
        desc: "The fastest way to add accounts, sync your feed, or write a script.",
      },
      checklist: {
        title: "Finish setting up",
        desc: "Pick up where you left off — this card tracks your setup progress.",
      },
    },
  },
};

export type TourDict = typeof en;
export const tourEn = en;

export const tourAr: TourDict = {
  tour: {
    next: "التالي",
    prev: "رجوع",
    done: "تم",
    progress: "{{current}} من {{total}}",
    takeTour: "جولة تعريفية",
    pageHelp: "جولة تعريفية بهذه الصفحة",
    inviteTitle: "جديد هنا؟ خذ جولة سريعة من 60 ثانية",
    inviteAction: "ابدأ الجولة",
    inviteDismiss: "لا شكرًا",
    steps: {
      accounts: {
        title: "تتبع الحسابات",
        desc: "أضف صنّاع محتوى في مجالك تريد التعلّم من ريلاتهم.",
      },
      trends: {
        title: "رادار المجال",
        desc: "شاهد ما يتفوق أداؤه الآن عبر جميع الحسابات التي يتابعها مستخدمو ReelSpy.",
      },
      feed: {
        title: "محتواك",
        desc: "كل ريل مُزامن من الحسابات التي تتابعها، مرتّبًا حسب الأداء.",
      },
      scripts: {
        title: "النصوص",
        desc: "حوّل أي ريل إلى نص أصلي مكتوب بأسلوبك الخاص.",
      },
      myIg: {
        title: "حسابي على إنستغرام",
        desc: "إحصاءات حسابك الخاص، بعد ربطه.",
      },
      menu: {
        title: "القائمة",
        desc: "كل ما يقدّمه ReelSpy موجود خلف هذا الزر — الحسابات، المحتوى، النصوص، والمزيد.",
      },
      quickActions: {
        title: "إجراءات سريعة",
        desc: "أسرع طريقة لإضافة حسابات، مزامنة محتواك، أو كتابة نص.",
      },
      checklist: {
        title: "أكمل الإعداد",
        desc: "تابع من حيث توقفت — تعرض هذه البطاقة تقدّم إعدادك.",
      },
    },
  },
};
