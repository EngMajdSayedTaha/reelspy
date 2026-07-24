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
    planSwitched: "Plan updated — your new limits are live.",
    couldNotStartCheckout: "Could not start checkout.",
    couldNotOpenPortal: "Could not open billing portal.",
    pageTour: {
      steps: {
        planUsage: {
          title: "Your plan & usage",
          desc: "See your current tier, renewal date, and how close you are to each monthly limit.",
        },
        manageBilling: {
          title: "Manage subscription",
          desc: "Open the Stripe billing portal to update payment method, invoices, or cancel.",
        },
        comparison: {
          title: "Compare plans",
          desc: "Compare features and upgrade or switch plans directly from here.",
        },
      },
    },
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
          "30 tracked accounts",
          "60 scripts / month",
          "Claude Sonnet scripts",
          "15 auto-replies",
        ],
      },
      pro: {
        name: "Pro",
        tagline: "Serious creators & SMMs",
        highlights: [
          "50 tracked accounts",
          "200 scripts / month",
          "Claude Opus scripts",
          "30 auto-replies",
          "4 publish targets",
        ],
      },
      studio: {
        name: "Studio",
        tagline: "Agencies & teams",
        highlights: [
          "100 tracked accounts",
          "Unlimited scripts",
          "Claude Opus scripts",
          "60 auto-replies",
          "4 publish targets",
        ],
      },
      custom: {
        name: "Custom",
        tagline: "Build your own",
        highlights: ["Set your own limits below"],
      },
    } as Record<"free" | "creator" | "pro" | "studio" | "custom", { name: string; tagline: string; highlights: string[] }>,
    customPlan: {
      heading: "Build your own plan",
      subheading: "Drag the sliders to fit your workflow — the price updates as you go.",
      trackedAccounts: "Tracked accounts",
      scriptsPerMonth: "Scripts / month",
      unlimitedScripts: "Unlimited scripts",
      autoReplies: "Auto-replies",
      publishTargets: "Publish targets",
      aiModel: "AI model",
      modelSonnet: "Claude Sonnet",
      modelOpus: "Claude Opus",
      modelSonnetHint: "Fast, high-quality scripts",
      modelOpusHint: "Anthropic's most capable model",
      estimatedPrice: "Estimated price",
      subscribeCustom: "Subscribe to this plan",
    },
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
    planSwitched: "تم تحديث باقتك — حدودك الجديدة فعّالة الآن.",
    couldNotStartCheckout: "تعذّر بدء عملية الدفع.",
    couldNotOpenPortal: "تعذّر فتح بوابة الفوترة.",
    pageTour: {
      steps: {
        planUsage: {
          title: "باقتك واستخدامك",
          desc: "اطّلع على باقتك الحالية وتاريخ التجديد ومدى قربك من كل حد شهري.",
        },
        manageBilling: {
          title: "إدارة الاشتراك",
          desc: "افتح بوابة Stripe للفوترة لتحديث وسيلة الدفع أو الفواتير أو الإلغاء.",
        },
        comparison: {
          title: "قارن الباقات",
          desc: "قارن المزايا وارتقِ أو بدّل الباقة مباشرة من هنا.",
        },
      },
    },
    plans: {
      free: {
        name: "مجانية",
        tagline: "جرّب سير العمل",
        highlights: ["3 حسابات متابَعة", "10 نصوص شهريًا", "ذكاء اصطناعي بالوصف فقط"],
      },
      creator: {
        name: "Creator",
        tagline: "للعاملين المستقلين",
        highlights: [
          "30 حسابًا متابَعًا",
          "60 نصًا شهريًا",
          "نصوص Claude Sonnet",
          "15 ردًا آليًا",
        ],
      },
      pro: {
        name: "Pro",
        tagline: "لصنّاع المحتوى الجادّين ومديري وسائل التواصل الاجتماعي",
        highlights: [
          "50 حسابًا متابَعًا",
          "200 نص شهريًا",
          "نصوص Claude Opus",
          "30 ردًا آليًا",
          "4 وجهات نشر",
        ],
      },
      studio: {
        name: "Studio",
        tagline: "للوكالات والفرق",
        highlights: [
          "100 حساب متابَع",
          "نصوص غير محدودة",
          "نصوص Claude Opus",
          "60 ردًا آليًا",
          "4 وجهات نشر",
        ],
      },
      custom: {
        name: "مخصّصة",
        tagline: "صمّم باقتك",
        highlights: ["حدّد الحدود الخاصة بك أدناه"],
      },
    },
    customPlan: {
      heading: "صمّم باقتك الخاصة",
      subheading: "حرّك الأشرطة لتناسب سير عملك — يتحدّث السعر تلقائيًا.",
      trackedAccounts: "الحسابات المتابَعة",
      scriptsPerMonth: "النصوص / شهريًا",
      unlimitedScripts: "نصوص غير محدودة",
      autoReplies: "الردود الآلية",
      publishTargets: "وجهات النشر",
      aiModel: "نموذج الذكاء الاصطناعي",
      modelSonnet: "Claude Sonnet",
      modelOpus: "Claude Opus",
      modelSonnetHint: "نصوص سريعة وعالية الجودة",
      modelOpusHint: "أقوى نماذج Anthropic",
      estimatedPrice: "السعر التقديري",
      subscribeCustom: "اشترك في هذه الباقة",
    },
  },
};
