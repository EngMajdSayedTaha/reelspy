// Waitlist dictionary domain: the closed-beta surfaces inside this app — the
// /waitlist screen (both its signed-out join form and its signed-in "you're
// #47" state) and the join form that replaces /signup while the gate is
// closed. The marketing site keeps its own copy in reelspy-landing's
// lib/i18n/{en,ar}.ts, because those strings render on a different origin.
// Composed into the root `Dict` by lib/i18n/dictionaries/index.ts.

const en = {
  waitlist: {
    // Shared form
    heading: "Join the waiting list",
    sub: "ReelSpy is in closed beta. Leave your email and we'll open your access in the next batch.",
    emailLabel: "Email",
    emailPlaceholder: "you@example.com",
    nameLabel: "Name",
    namePlaceholder: "Optional",
    handleLabel: "Instagram handle",
    handlePlaceholder: "@yourhandle",
    nicheLabel: "Your niche",
    nichePlaceholder: "Fitness, food, real estate…",
    followersLabel: "Followers",
    followersPlaceholder: "Prefer not to say",
    referralLabel: "How did you hear about us?",
    referralPlaceholder: "Instagram, a friend, search…",
    optionalDetails: "Add a few details (optional)",
    optionalHint: "Only your email is required. The rest just helps us prioritise who we let in first.",
    submit: "Join the waiting list",
    submitting: "Joining…",
    total: (n: number) => `${n} creator${n === 1 ? "" : "s"} already on the list`,

    // Result states
    joinedHeading: "You're on the list.",
    joinedBody: (n: number) => `You're #${n}. We'll email you the moment your access opens.`,
    alreadyHeading: "You're already on the list.",
    alreadyBody: (n: number) => `You're #${n} — no need to sign up again. We'll email you when access opens.`,
    checkEmail: "Check your inbox for a confirmation — if it isn't there in a few minutes, look in spam.",
    approvedHeading: "You're approved.",
    approvedBody: "Your access is already open — create your account with this address and you'll go straight in.",

    // Signed-in pending screen
    pendingHeading: "You're on the list.",
    pendingSub: "Your account is ready. We're opening access in batches while we make sure everyone gets fast data and scripts from day one.",
    positionLabel: "Your place",
    aheadLabel: (n: number) => (n === 0 ? "You're next in line" : `${n} ahead of you`),
    totalLabel: "On the list",
    ticketLabel: (n: number) => `#${n}`,
    whatNextHeading: "What happens next",
    whatNext1: "We email this address the moment your access opens.",
    whatNext2: "Nothing is lost — sign in any time and you'll come straight here until then.",
    whatNext3: "Want to move up? Reply to our email with your niche and follower count.",
    refresh: "Check again",
    signOut: "Sign out",
    signedInAs: (email: string) => `Signed in as ${email}`,

    // Errors
    errorGeneric: "Couldn't save that. Try again in a moment.",
    errorEmail: "Enter a valid email address.",
    errorThrottled: "That's a lot of requests. Try again a bit later.",
    closedHeading: "Good news — signups are open.",
    closedBody: "The waiting list has been lifted. You can create your account right now.",
    goToSignup: "Create your account",
    approvedEmailLocked: "This is the address that's approved for the waiting list — sign up with it to go straight in.",
  },
};

export type WaitlistDict = typeof en;
export const waitlistEn = en;

export const waitlistAr: WaitlistDict = {
  waitlist: {
    heading: "انضم إلى قائمة الانتظار",
    sub: "ريل سباي في مرحلة تجريبية مغلقة. اترك بريدك الإلكتروني وسنفتح لك الوصول في الدفعة القادمة.",
    emailLabel: "البريد الإلكتروني",
    emailPlaceholder: "you@example.com",
    nameLabel: "الاسم",
    namePlaceholder: "اختياري",
    handleLabel: "حساب إنستغرام",
    handlePlaceholder: "@حسابك",
    nicheLabel: "مجالك",
    nichePlaceholder: "لياقة، طعام، عقارات…",
    followersLabel: "عدد المتابعين",
    followersPlaceholder: "أفضّل عدم الإفصاح",
    referralLabel: "كيف سمعت عنا؟",
    referralPlaceholder: "إنستغرام، صديق، بحث…",
    optionalDetails: "أضف بعض التفاصيل (اختياري)",
    optionalHint: "البريد الإلكتروني وحده مطلوب. الباقي يساعدنا فقط في ترتيب أولوية من ندخله أولًا.",
    submit: "انضم إلى قائمة الانتظار",
    submitting: "جارٍ الانضمام…",
    total: (n: number) => `${n} صانع محتوى على القائمة بالفعل`,

    joinedHeading: "أنت على القائمة.",
    joinedBody: (n: number) => `ترتيبك #${n}. سنراسلك فور فتح الوصول لك.`,
    alreadyHeading: "أنت على القائمة بالفعل.",
    alreadyBody: (n: number) => `ترتيبك #${n} — لا داعي للتسجيل مرة أخرى. سنراسلك عند فتح الوصول.`,
    checkEmail: "تحقق من بريدك الوارد لرسالة التأكيد — وإن لم تصل خلال دقائق، راجع مجلد الرسائل غير المرغوبة.",
    approvedHeading: "تمت الموافقة عليك.",
    approvedBody: "وصولك مفتوح بالفعل — أنشئ حسابك بهذا العنوان وستدخل مباشرة.",

    pendingHeading: "أنت على القائمة.",
    pendingSub: "حسابك جاهز. نفتح الوصول على دفعات لنضمن حصول الجميع على بيانات وسكربتات سريعة من اليوم الأول.",
    positionLabel: "ترتيبك",
    aheadLabel: (n: number) => (n === 0 ? "أنت التالي في القائمة" : `${n} قبلك`),
    totalLabel: "على القائمة",
    ticketLabel: (n: number) => `#${n}`,
    whatNextHeading: "ما الذي سيحدث بعد ذلك",
    whatNext1: "سنراسل هذا البريد فور فتح الوصول لك.",
    whatNext2: "لن يضيع شيء — سجّل الدخول في أي وقت وستصل إلى هنا حتى ذلك الحين.",
    whatNext3: "تريد التقدّم في القائمة؟ رد على رسالتنا بمجالك وعدد متابعيك.",
    refresh: "تحقق مرة أخرى",
    signOut: "تسجيل الخروج",
    signedInAs: (email: string) => `مسجّل الدخول باسم ${email}`,

    errorGeneric: "تعذّر الحفظ. حاول مرة أخرى بعد قليل.",
    errorEmail: "أدخل بريدًا إلكترونيًا صحيحًا.",
    errorThrottled: "عدد كبير من المحاولات. حاول مرة أخرى بعد قليل.",
    closedHeading: "خبر جيد — التسجيل مفتوح.",
    closedBody: "تم رفع قائمة الانتظار. يمكنك إنشاء حسابك الآن.",
    goToSignup: "أنشئ حسابك",
    approvedEmailLocked: "هذا هو العنوان الموافق عليه في قائمة الانتظار — سجّل به لتدخل مباشرة.",
  },
};
