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
    // The end-of-period policy, stated permanently on the page (not only in the
    // confirmation dialogs) so nobody has to click something to learn the rule.
    policy: {
      title: "How plan changes work",
      body: "Upgrades and downgrades always start on your next renewal date. You keep the plan you've already paid for until then — nothing is charged, prorated or refunded in the middle of a billing period, and every change is confirmed before it's made.",
    },
    scheduledBadge: "Scheduled",
    scheduledChange: {
      title: (plan: string) => `Scheduled: your plan changes to ${plan}`,
      body: (current: string, plan: string, date: string) =>
        `You stay on ${current} with your current limits until ${date}. On ${date} your subscription renews as ${plan} and the new limits apply.`,
      bodyNoDate: (current: string, plan: string) =>
        `You stay on ${current} until the end of your current billing period, then your subscription renews as ${plan}.`,
      priceFrom: (price: string, date: string) => `From ${date} you'll be charged ${price} per month.`,
      keep: "Keep my current plan",
      confirmTitle: (plan: string) => `Cancel the scheduled switch to ${plan}?`,
      confirmBody: (current: string, plan: string, date: string) =>
        `The switch to ${plan} on ${date} will be called off. You stay on ${current} and it keeps renewing exactly as it does now. Nothing has been charged for the change, so there's nothing to refund. You can schedule a different plan at any time.`,
      confirmCta: "Yes, keep my plan",
      kept: (plan: string) => `Scheduled change cancelled — you're staying on ${plan}.`,
    },
    subscribeConfirm: {
      title: (plan: string) => `Start the ${plan} plan?`,
      body: (plan: string, price: string) =>
        `You'll be taken to Stripe's secure checkout to subscribe to ${plan} at ${price} per month. Your plan and its limits become active as soon as the payment succeeds, and it renews every month until you cancel. Nothing is charged until you finish checkout.`,
      cta: "Continue to checkout",
    },
    switchConfirm: {
      upgradeTitle: (plan: string) => `Upgrade to ${plan} from your next renewal?`,
      downgradeTitle: (plan: string) => `Move to ${plan} from your next renewal?`,
      changeTitle: (plan: string) => `Switch to ${plan} from your next renewal?`,
      body: (current: string, plan: string, date: string, price: string) =>
        `Nothing changes today and nothing is charged today. You keep ${current} — with everything it includes — until ${date}, because you've already paid for that period. On ${date} your subscription renews as ${plan} at ${price} per month and your new limits apply from that moment. You can cancel this scheduled change any time before ${date}.`,
      bodyNoDate: (current: string, plan: string, price: string) =>
        `Nothing changes today and nothing is charged today. You keep ${current} until the end of the period you've already paid for, then your subscription renews as ${plan} at ${price} per month.`,
      downgradeNote: (current: string, date: string) =>
        ` Your higher ${current} limits stay available until ${date}.`,
      upgradeCta: "Schedule upgrade",
      downgradeCta: "Schedule downgrade",
      changeCta: "Schedule change",
      scheduled: (plan: string, date: string) => `Scheduled — you move to ${plan} on ${date}.`,
      scheduledNoDate: (plan: string) => `Scheduled — you move to ${plan} at your next renewal.`,
    },
    cancelPlan: {
      action: "Move to Free",
      title: (plan: string) => `Cancel your ${plan} subscription?`,
      body: (plan: string, date: string) =>
        `You keep every ${plan} feature and limit until ${date} — you've already paid for that period, so nothing is cut short. On ${date} your subscription ends, you won't be charged again, and your account moves to the Free plan. Nothing in your account is deleted, and you can undo this at any time before ${date}.`,
      bodyNoDate: (plan: string) =>
        `You keep every ${plan} feature until the end of the period you've paid for. After that your subscription ends, you won't be charged again, and your account moves to the Free plan. Nothing in your account is deleted.`,
      cta: "Cancel at period end",
      done: (date: string) => `Cancelled — you keep full access until ${date}.`,
      doneNoDate: "Cancelled — you keep access until the end of your paid period.",
      pendingTitle: (date: string) => `Your plan ends on ${date}`,
      pendingBody: (plan: string, date: string) =>
        `You keep full ${plan} access until ${date}. You won't be charged again, and your account moves to the Free plan on that date.`,
    },
    resumePlan: {
      action: "Resume subscription",
      title: (plan: string) => `Resume your ${plan} subscription?`,
      body: (plan: string, date: string, price: string) =>
        `Your ${plan} plan will keep renewing instead of ending. Nothing is charged today — your normal renewal of ${price} continues on ${date}.`,
      bodyNoDate: (plan: string) =>
        `Your ${plan} plan will keep renewing instead of ending. Nothing is charged today.`,
      cta: "Resume subscription",
      done: (plan: string) => `Your ${plan} subscription will continue.`,
    },
    portalConfirm: {
      title: "Open the Stripe billing portal?",
      body: "You'll be taken to Stripe's secure portal, where you can update your card, view payment history and download invoices. Your ReelSpy plan and limits are not changed by opening it — come back to this page to change plans.",
      cta: "Open Stripe portal",
    },
    customPlanConfirm: {
      subscribeTitle: "Subscribe to your custom plan?",
      switchTitle: "Switch to your custom plan from your next renewal?",
      summary: (accounts: string, scripts: string, automations: string, targets: string, model: string) =>
        `Your configuration: ${accounts} tracked accounts, ${scripts} scripts a month, ${automations} auto-replies, ${targets} publish targets, ${model}.`,
    },
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
    policy: {
      title: "كيف تعمل تغييرات الباقة",
      body: "تبدأ الترقية أو التخفيض دائمًا في تاريخ التجديد التالي. تحتفظ بالباقة التي دفعت ثمنها حتى ذلك التاريخ — فلا يتم خصم أي مبلغ أو احتسابه تناسبيًا أو ردّه في منتصف فترة الفوترة، ويُطلب تأكيدك قبل أي تغيير.",
    },
    scheduledBadge: "مجدول",
    scheduledChange: {
      title: (plan: string) => `مجدول: ستتغيّر باقتك إلى ${plan}`,
      body: (current: string, plan: string, date: string) =>
        `تبقى على باقة ${current} بحدودها الحالية حتى ${date}. وفي ${date} يتم تجديد اشتراكك على باقة ${plan} وتُطبَّق الحدود الجديدة.`,
      bodyNoDate: (current: string, plan: string) =>
        `تبقى على باقة ${current} حتى نهاية فترة الفوترة الحالية، ثم يتم تجديد اشتراكك على باقة ${plan}.`,
      priceFrom: (price: string, date: string) => `اعتبارًا من ${date} سيتم خصم ${price} شهريًا.`,
      keep: "الاحتفاظ بباقتي الحالية",
      confirmTitle: (plan: string) => `إلغاء التبديل المجدول إلى ${plan}؟`,
      confirmBody: (current: string, plan: string, date: string) =>
        `سيتم إلغاء التبديل إلى ${plan} في ${date}. تبقى على باقة ${current} ويستمر تجديدها تمامًا كما هي الآن. لم يتم خصم أي مبلغ مقابل التغيير، لذا لا يوجد ما يُردّ. ويمكنك جدولة باقة أخرى في أي وقت.`,
      confirmCta: "نعم، احتفظ بباقتي",
      kept: (plan: string) => `تم إلغاء التغيير المجدول — ستبقى على باقة ${plan}.`,
    },
    subscribeConfirm: {
      title: (plan: string) => `هل تريد بدء باقة ${plan}؟`,
      body: (plan: string, price: string) =>
        `سيتم نقلك إلى صفحة الدفع الآمنة عبر Stripe للاشتراك في باقة ${plan} بسعر ${price} شهريًا. تصبح الباقة وحدودها فعّالة فور نجاح الدفع، ويتجدد الاشتراك شهريًا حتى تقوم بإلغائه. ولن يتم خصم أي مبلغ قبل إتمام عملية الدفع.`,
      cta: "المتابعة إلى الدفع",
    },
    switchConfirm: {
      upgradeTitle: (plan: string) => `الترقية إلى ${plan} بدءًا من التجديد التالي؟`,
      downgradeTitle: (plan: string) => `الانتقال إلى ${plan} بدءًا من التجديد التالي؟`,
      changeTitle: (plan: string) => `التبديل إلى ${plan} بدءًا من التجديد التالي؟`,
      body: (current: string, plan: string, date: string, price: string) =>
        `لن يتغيّر شيء اليوم ولن يتم خصم أي مبلغ اليوم. تحتفظ بباقة ${current} بكل ما تتضمّنه حتى ${date} لأنك دفعت ثمن تلك الفترة بالفعل. وفي ${date} يتم تجديد اشتراكك على باقة ${plan} بسعر ${price} شهريًا وتُطبَّق حدودك الجديدة من تلك اللحظة. ويمكنك إلغاء هذا التغيير المجدول في أي وقت قبل ${date}.`,
      bodyNoDate: (current: string, plan: string, price: string) =>
        `لن يتغيّر شيء اليوم ولن يتم خصم أي مبلغ اليوم. تحتفظ بباقة ${current} حتى نهاية الفترة المدفوعة، ثم يتم تجديد اشتراكك على باقة ${plan} بسعر ${price} شهريًا.`,
      downgradeNote: (current: string, date: string) =>
        ` تبقى حدود باقة ${current} الأعلى متاحة لك حتى ${date}.`,
      upgradeCta: "جدولة الترقية",
      downgradeCta: "جدولة التخفيض",
      changeCta: "جدولة التغيير",
      scheduled: (plan: string, date: string) => `تمت الجدولة — ستنتقل إلى ${plan} في ${date}.`,
      scheduledNoDate: (plan: string) => `تمت الجدولة — ستنتقل إلى ${plan} عند التجديد التالي.`,
    },
    cancelPlan: {
      action: "الانتقال إلى المجانية",
      title: (plan: string) => `إلغاء اشتراك ${plan}؟`,
      body: (plan: string, date: string) =>
        `تحتفظ بكل مزايا وحدود باقة ${plan} حتى ${date} — فقد دفعت ثمن تلك الفترة ولن يتم إنهاؤها مبكرًا. وفي ${date} ينتهي اشتراكك، ولن يتم خصم أي مبلغ بعد ذلك، وينتقل حسابك إلى الباقة المجانية. لن يُحذف أي شيء من حسابك، ويمكنك التراجع في أي وقت قبل ${date}.`,
      bodyNoDate: (plan: string) =>
        `تحتفظ بكل مزايا باقة ${plan} حتى نهاية الفترة المدفوعة. بعدها ينتهي اشتراكك ولن يتم خصم أي مبلغ، وينتقل حسابك إلى الباقة المجانية. ولن يُحذف أي شيء من حسابك.`,
      cta: "الإلغاء في نهاية الفترة",
      done: (date: string) => `تم الإلغاء — تحتفظ بكامل الصلاحيات حتى ${date}.`,
      doneNoDate: "تم الإلغاء — تحتفظ بصلاحياتك حتى نهاية الفترة المدفوعة.",
      pendingTitle: (date: string) => `تنتهي باقتك في ${date}`,
      pendingBody: (plan: string, date: string) =>
        `تحتفظ بكامل صلاحيات باقة ${plan} حتى ${date}. لن يتم خصم أي مبلغ بعد ذلك، وينتقل حسابك إلى الباقة المجانية في ذلك التاريخ.`,
    },
    resumePlan: {
      action: "استئناف الاشتراك",
      title: (plan: string) => `استئناف اشتراك ${plan}؟`,
      body: (plan: string, date: string, price: string) =>
        `ستستمر باقة ${plan} في التجديد بدلاً من الانتهاء. لن يتم خصم أي مبلغ اليوم — ويستمر تجديدك المعتاد بمبلغ ${price} في ${date}.`,
      bodyNoDate: (plan: string) =>
        `ستستمر باقة ${plan} في التجديد بدلاً من الانتهاء. ولن يتم خصم أي مبلغ اليوم.`,
      cta: "استئناف الاشتراك",
      done: (plan: string) => `سيستمر اشتراك ${plan} الخاص بك.`,
    },
    portalConfirm: {
      title: "فتح بوابة الفوترة من Stripe؟",
      body: "سيتم نقلك إلى بوابة Stripe الآمنة حيث يمكنك تحديث بطاقتك والاطّلاع على سجل المدفوعات وتنزيل الفواتير. لن تتغيّر باقتك أو حدودك في ReelSpy بمجرد فتحها — عُد إلى هذه الصفحة لتغيير الباقة.",
      cta: "فتح بوابة Stripe",
    },
    customPlanConfirm: {
      subscribeTitle: "الاشتراك في باقتك المخصّصة؟",
      switchTitle: "التبديل إلى باقتك المخصّصة بدءًا من التجديد التالي؟",
      summary: (accounts: string, scripts: string, automations: string, targets: string, model: string) =>
        `إعداداتك: ${accounts} حسابًا متابَعًا، ${scripts} نصًا شهريًا، ${automations} ردًا آليًا، ${targets} وجهة نشر، ${model}.`,
    },
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
