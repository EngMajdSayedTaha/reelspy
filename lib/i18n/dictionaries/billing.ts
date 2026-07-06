// Billing dictionary domain: /dashboard/billing page + BillingActions buttons.
// Composed into the root `Dict` by `lib/i18n/dictionaries/index.ts`.

const en = {
  billing: {
    heading: "Billing & plan",
    subheading: "Manage your subscription and see how much of your plan you've used this month.",
    checkoutSuccess:
      "Payment received — your plan is being activated. It may take a few seconds to appear.",
    checkoutCancelled: "Checkout cancelled — no changes were made.",
    paymentsPreview: "Payments aren't live yet — plans are shown for preview. Check back soon.",
    planLabel: (name: string) => `${name} plan`,
    active: "Active",
    free: "Free",
    current: "Current",
    yourCurrentPlan: "Your current plan",
    included: "Included",
    cancelsOn: (date: string) => `Cancels on ${date}.`,
    renewsOn: (date: string) => `Renews on ${date}.`,
    statusLabel: (status: string) => `Status: ${status}.`,
    onFreePlan: "You're on the free plan. Upgrade any time to raise your limits.",
    usage: {
      trackedAccounts: "Tracked accounts",
      scriptsThisMonth: "Scripts this month",
      transcriptsThisMonth: "Transcripts this month",
      autoReplies: "Auto-replies",
    },
    perMonthSuffix: "/mo",
    upgrade: "Upgrade",
    switchPlan: "Switch plan",
    manageBilling: "Manage billing",
    couldNotStartCheckout: "Could not start checkout.",
    couldNotOpenPortal: "Could not open billing portal.",
    plans: {
      free: {
        name: "Free",
        tagline: "Try the workflow",
        highlights: ["3 tracked accounts", "10 scripts / month", "Caption-only AI"],
      },
      creator: {
        name: "Creator",
        tagline: "Solo operators",
        highlights: [
          "10 tracked accounts",
          "60 scripts / month",
          "Claude Haiku scripts",
          "3 auto-replies",
        ],
      },
      pro: {
        name: "Pro",
        tagline: "Serious creators & SMMs",
        highlights: [
          "25 tracked accounts",
          "200 scripts / month",
          "Claude Sonnet scripts",
          "10 auto-replies",
          "4 publish targets",
        ],
      },
      studio: {
        name: "Studio",
        tagline: "Agencies & teams",
        highlights: [
          "50 tracked accounts",
          "Unlimited scripts",
          "Claude Sonnet scripts",
          "30 auto-replies",
          "4 publish targets",
        ],
      },
    } as Record<"free" | "creator" | "pro" | "studio", { name: string; tagline: string; highlights: string[] }>,
  },
};

export type BillingDict = typeof en;
export const billingEn = en;

export const billingAr: BillingDict = {
  billing: {
    heading: "الاشتراك والباقة",
    subheading: "أدر اشتراكك واطّلع على مقدار استخدامك لباقتك هذا الشهر.",
    checkoutSuccess: "تم استلام الدفعة — يجري الآن تفعيل باقتك. قد يستغرق ظهورها بضع ثوانٍ.",
    checkoutCancelled: "تم إلغاء عملية الدفع — لم يتم إجراء أي تغييرات.",
    paymentsPreview: "المدفوعات غير مفعّلة بعد — الباقات معروضة للاطّلاع فقط. تابعنا قريبًا.",
    planLabel: (name: string) => `باقة ${name}`,
    active: "نشط",
    free: "مجانية",
    current: "الحالية",
    yourCurrentPlan: "باقتك الحالية",
    included: "متضمّنة",
    cancelsOn: (date: string) => `سيتم الإلغاء في ${date}.`,
    renewsOn: (date: string) => `يتم التجديد في ${date}.`,
    statusLabel: (status: string) => `الحالة: ${status}.`,
    onFreePlan: "أنت مشترك في الباقة المجانية. يمكنك الترقية في أي وقت لرفع حدودك.",
    usage: {
      trackedAccounts: "الحسابات المتابَعة",
      scriptsThisMonth: "النصوص هذا الشهر",
      transcriptsThisMonth: "النصوص المفرغة هذا الشهر",
      autoReplies: "الردود الآلية",
    },
    perMonthSuffix: "/شهريًا",
    upgrade: "ترقية",
    switchPlan: "تبديل الباقة",
    manageBilling: "إدارة الفوترة",
    couldNotStartCheckout: "تعذّر بدء عملية الدفع.",
    couldNotOpenPortal: "تعذّر فتح بوابة الفوترة.",
    plans: {
      free: {
        name: "مجانية",
        tagline: "جرّب سير العمل",
        highlights: ["3 حسابات متابَعة", "10 نصوص شهريًا", "ذكاء اصطناعي بالتعليق فقط"],
      },
      creator: {
        name: "كرييتور",
        tagline: "للعاملين المستقلين",
        highlights: [
          "10 حسابات متابَعة",
          "60 نصًا شهريًا",
          "نصوص Claude Haiku",
          "3 ردود آلية",
        ],
      },
      pro: {
        name: "برو",
        tagline: "لصانعي المحتوى الجادين ومديري السوشيال ميديا",
        highlights: [
          "25 حسابًا متابَعًا",
          "200 نص شهريًا",
          "نصوص Claude Sonnet",
          "10 ردود آلية",
          "4 وجهات نشر",
        ],
      },
      studio: {
        name: "ستوديو",
        tagline: "للوكالات والفرق",
        highlights: [
          "50 حسابًا متابَعًا",
          "نصوص غير محدودة",
          "نصوص Claude Sonnet",
          "30 ردًا آليًا",
          "4 وجهات نشر",
        ],
      },
    },
  },
};
