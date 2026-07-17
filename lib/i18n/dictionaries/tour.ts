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
      dashboard: {
        title: "Your home base",
        desc: "A quick pulse on your setup, one-tap actions, and creators worth tracking. This is where you land every time.",
      },
      accounts: {
        title: "Track accounts",
        desc: "Add creators in your niche whose reels you want to learn from — the engine behind everything else.",
      },
      feed: {
        title: "Your feed",
        desc: "Every synced reel from the accounts you track, ranked by performance so the winners rise to the top.",
      },
      trends: {
        title: "Niche Radar",
        desc: "See what's over-performing right now across every ReelSpy user's tracked accounts.",
      },
      hooks: {
        title: "Hook library",
        desc: "Save the opening lines that stop the scroll, then reuse them in your own reels.",
      },
      scripts: {
        title: "Scripts",
        desc: "Turn any reel into an original script written in your own voice.",
      },
      myIg: {
        title: "My Instagram",
        desc: "Connect your own account to see its insights and personalised growth notes.",
      },
      automations: {
        title: "Auto-Reply",
        desc: "Automatically respond to comments and DMs so no lead goes cold while you sleep.",
      },
      publishing: {
        title: "Publishing",
        desc: "Publish or schedule reels to Instagram, TikTok, and YouTube from one place.",
      },
      calendar: {
        title: "Content calendar",
        desc: "Plan ahead and see everything you've scheduled at a glance.",
      },
      connections: {
        title: "Connections",
        desc: "Connect and manage your Instagram, TikTok, and YouTube accounts.",
      },
      billing: {
        title: "Billing",
        desc: "Your plan, usage, and upgrades all live here.",
      },
      settings: {
        title: "Settings",
        desc: "Fine-tune your language, brand voice, email digest, and account preferences.",
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
      dashboard: {
        title: "نقطة انطلاقك",
        desc: "نظرة سريعة على إعدادك، إجراءات بلمسة واحدة، وحسابات تستحق المتابعة. هنا تبدأ في كل مرة.",
      },
      accounts: {
        title: "تتبع الحسابات",
        desc: "أضف صنّاع محتوى في مجالك تريد التعلّم من ريلاتهم — المحرّك وراء كل شيء آخر.",
      },
      feed: {
        title: "محتواك",
        desc: "كل ريل مُزامن من الحسابات التي تتابعها، مرتّبًا حسب الأداء لتظهر الأفضل في الأعلى.",
      },
      trends: {
        title: "رادار المجال",
        desc: "شاهد ما يتفوق أداؤه الآن عبر جميع الحسابات التي يتابعها مستخدمو ReelSpy.",
      },
      hooks: {
        title: "مكتبة الجمل الافتتاحية",
        desc: "احفظ الجمل الافتتاحية التي توقف التمرير، ثم أعد استخدامها في ريلاتك.",
      },
      scripts: {
        title: "النصوص",
        desc: "حوّل أي ريل إلى نص أصلي مكتوب بأسلوبك الخاص.",
      },
      myIg: {
        title: "حسابي على إنستغرام",
        desc: "اربط حسابك الخاص لرؤية إحصاءاته وملاحظات نمو مخصّصة لك.",
      },
      automations: {
        title: "الرد الآلي",
        desc: "ردّ تلقائيًا على التعليقات والرسائل حتى لا يضيع أي عميل محتمل وأنت نائم.",
      },
      publishing: {
        title: "النشر",
        desc: "انشر أو جدوِل الريلات على إنستغرام وتيك توك ويوتيوب من مكان واحد.",
      },
      calendar: {
        title: "تقويم المحتوى",
        desc: "خطّط مسبقًا وشاهد كل ما جدولته في لمحة.",
      },
      connections: {
        title: "الربط",
        desc: "اربط وأدر حساباتك على إنستغرام وتيك توك ويوتيوب.",
      },
      billing: {
        title: "الاشتراك",
        desc: "باقتك واستهلاكك والترقيات، كلها هنا.",
      },
      settings: {
        title: "الإعدادات",
        desc: "اضبط لغتك، أسلوب علامتك، الملخّص البريدي، وتفضيلات حسابك.",
      },
    },
  },
};
