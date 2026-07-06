// Legal pages dictionary domain: /privacy, /terms, /cookies + the shared
// LegalLayout/LegalSection chrome. Composed into the root `Dict` by
// `lib/i18n/dictionaries/index.ts`.
//
// Structure mirrors each page's <LegalSection> breakdown so it stays typed
// and maintainable: `legal.<page>.sections.<section>.<piece>`. Sentences that
// wrap an inline <Link>/<a> in the original JSX are split into
// `before`/(reused link text)/`after` (and `middle` where there are two
// links) so the dictionary only carries prose, not markup. A few list items
// that originally wrapped two separate bold spans around a connector (e.g.
// "Anthropic" and "NVIDIA" each bolded, joined by "and") are combined into a
// single `label` per item — a minor structural simplification, not a meaning
// change; see the handoff report.

const en = {
  legal: {
    common: {
      back: "Back",
      lastUpdated: (date: string) => `Last updated: ${date}`,
      termsOfService: "Terms of Service",
      privacyPolicy: "Privacy Policy",
      cookiePolicy: "Cookie Policy",
    },
    privacy: {
      title: "Privacy Policy",
      metaDescription: "How ReelSpy collects, uses, and protects your data.",
      updatedDate: "2026-07-03",
      intro:
        "This Privacy Policy explains how ReelSpy (“we”, “us”) collects, uses, and safeguards your information when you use the ReelSpy application. By using ReelSpy you agree to the practices described here.",
      sections: {
        collection: {
          heading: "1. Information We Collect",
          items: {
            account: {
              label: "Account data.",
              body: "Your email address and authentication identifiers when you sign up or sign in (including via Google).",
            },
            instagram: {
              label: "Instagram data.",
              body: "When you connect your Instagram account, we access profile details, media, and insights you authorize through Meta’s Graph API in order to power your feed and analytics.",
            },
            usage: {
              label: "Usage & preferences.",
              body: "Settings such as your theme, feed layout, and tracked accounts, stored to personalize your experience.",
            },
          },
        },
        use: {
          heading: "2. How We Use Your Information",
          intro: "We use your information to:",
          items: [
            "Provide, maintain, and improve the ReelSpy service.",
            "Authenticate you and keep your account secure.",
            "Sync and display Instagram content and performance insights.",
            "Remember your preferences across sessions.",
          ],
        },
        instagramPlatform: {
          heading: "3. Instagram & Meta Platform Data",
          body: "ReelSpy uses Meta’s Graph API. Access tokens are stored securely and used only to perform the actions you request. We do not sell your Instagram data. You can disconnect your Instagram account at any time from Settings, which removes the stored token.",
        },
        subprocessors: {
          heading: "4. Service Providers (Sub-processors)",
          intro:
            "We rely on the following third-party processors to run ReelSpy. Each receives only the data needed for its function, under its own security and privacy commitments:",
          providers: {
            supabase: { label: "Supabase", body: "database, authentication, and file storage." },
            vercel: { label: "Vercel", body: "application hosting and delivery." },
            cloudflareR2: {
              label: "Cloudflare R2",
              body: "storage for videos you upload for publishing.",
            },
            stripe: {
              label: "Stripe",
              body: "payment and subscription processing (we never store your card details).",
            },
            aiModels: {
              label: "Anthropic and NVIDIA",
              body: "AI models that generate scripts and suggestions from the inputs you provide.",
            },
            transcription: {
              label: "Groq and Hugging Face",
              body: "speech-to-text transcription of reels you choose to transcribe.",
            },
            platforms: {
              label: "Meta (Instagram & Facebook) and Google (YouTube & sign-in)",
              body: "platforms you connect and publish to via their APIs.",
            },
            resend: {
              label: "Resend",
              body: "transactional email (e.g. publish-failure notifications).",
            },
          },
          outro:
            "We do not sell your personal data, and we do not share it with third parties except the processors above or where required by law.",
        },
        cookiesSection: {
          heading: "5. Cookies",
          before:
            "We use essential cookies for authentication and to remember your consent and preferences. For details, see our ",
          after: ".",
        },
        retention: {
          heading: "6. Data Retention & Deletion",
          before:
            "We retain your data for as long as your account is active. You can delete your account at any time from ",
          settingsLinkText: "Settings",
          after:
            ". Deletion permanently removes your profile and all associated data — tracked accounts, reels, scripts, automations, uploaded videos, and event logs — and revokes any connected Meta access token. This action is immediate and cannot be undone.",
        },
        rights: {
          heading: "7. Your Rights",
          before:
            "Depending on your jurisdiction, you may have the right to access, correct, export, or delete your personal data. You can ",
          exportWord: "export",
          middle: " a machine-readable copy of your data and ",
          deleteWord: "delete",
          after: " your account yourself from Settings, or contact us to exercise any of these rights.",
        },
        security: {
          heading: "8. Security & Breach Notification",
          body: "We protect access tokens and other sensitive data with server-only access controls and encryption in transit. No system is perfectly secure; in the event of a personal data breach that is likely to affect you, we will notify affected users and the relevant authority without undue delay, consistent with applicable law.",
        },
        dpo: {
          heading: "9. Data Protection Contact (UAE PDPL)",
          before:
            "ReelSpy processes personal data in line with the UAE Personal Data Protection Law (PDPL). For data-protection requests or questions — access, correction, export, deletion, or objection — contact our data protection point of contact at ",
          after: ".",
        },
      },
    },
    terms: {
      title: "Terms of Service",
      metaDescription: "The terms that govern your use of ReelSpy.",
      updatedDate: "2026-07-03",
      intro:
        "These Terms of Service (“Terms”) govern your access to and use of ReelSpy (“ReelSpy”, “we”, “us”). By creating an account or using the service you agree to these Terms. If you do not agree, do not use ReelSpy.",
      sections: {
        service: {
          heading: "1. The Service",
          body: "ReelSpy is a content-research and creation tool for social media creators. It helps you track and analyze reels, generate scripts with AI assistance, and schedule or publish content to connected platforms. Features vary by plan and may change as the product evolves.",
        },
        eligibility: {
          heading: "2. Eligibility & Accounts",
          body: "You must be at least 18 years old and able to form a binding contract. You are responsible for your account credentials and for all activity under your account. You must provide accurate information and keep it up to date.",
        },
        billing: {
          heading: "3. Plans, Billing & Renewal",
          items: [
            "Paid plans (Creator, Pro, Studio) are billed in advance on a recurring monthly basis through our payment processor, Stripe. Prices are shown at checkout.",
            "Your subscription renews automatically each period until you cancel. You can cancel anytime from the billing portal; cancellation stops future charges and your paid access continues until the end of the current period.",
            "We may change prices or plan limits with reasonable notice. Changes take effect at your next renewal.",
          ],
        },
        refunds: {
          heading: "4. Refunds",
          before: "If you are not satisfied, email ",
          afterEmail: " within ",
          windowWord: "7 days",
          after:
            " of your first payment on a plan and we will refund that payment in full. Beyond this window, payments already made are non-refundable, but you can cancel at any time to avoid future charges. Nothing here limits rights you may have under applicable consumer law.",
        },
        acceptableUse: {
          heading: "5. Acceptable Use",
          intro: "You agree not to:",
          items: [
            "Violate the terms or policies of any connected platform (Instagram, Facebook, TikTok, YouTube) or applicable law.",
            "Publish content that is unlawful, infringing, deceptive, or harmful.",
            "Attempt to reverse-engineer, overload, scrape, or circumvent the rate limits or security of the service.",
            "Resell or share your account access without our permission.",
          ],
        },
        yourContent: {
          heading: "6. Your Content",
          body: "You retain ownership of the content you upload, generate, or publish through ReelSpy. You grant us the limited licence needed to store, process, and transmit that content to operate the service (for example, sending a video to a platform you chose to publish to). You are responsible for the content you publish and for having the rights to it.",
        },
        aiOutput: {
          heading: "7. AI-Generated Output",
          body: "Scripts and suggestions are produced with the help of third-party AI models and are provided as drafts. Output may be inaccurate or resemble other material; you are responsible for reviewing and editing anything before you publish it. ReelSpy does not guarantee any particular reach, engagement, or business result.",
        },
        thirdPartyPlatforms: {
          heading: "8. Third-Party Platforms",
          body: "ReelSpy connects to platforms you authorize via their official APIs. Your use of those platforms remains subject to their own terms, and their availability or API changes are outside our control. We are not responsible for actions taken by those platforms on your account.",
        },
        cancellation: {
          heading: "9. Cancellation & Termination",
          before:
            "You may stop using ReelSpy and delete your account at any time from Settings, which removes your data as described in our ",
          after:
            ". We may suspend or terminate access if you breach these Terms or use the service in a way that risks harm to others or to the platforms we integrate with.",
        },
        disclaimers: {
          heading: "10. Disclaimers & Liability",
          body: "The service is provided “as is” without warranties of any kind. To the maximum extent permitted by law, ReelSpy is not liable for indirect, incidental, or consequential damages, and our total liability for any claim is limited to the amount you paid us in the 3 months before the claim.",
        },
        governingLaw: {
          heading: "11. Governing Law",
          body: "These Terms are governed by the laws of the United Arab Emirates, without regard to conflict-of-law rules. Disputes are subject to the courts of the UAE.",
        },
        changes: {
          heading: "12. Changes & Contact",
          before:
            "We may update these Terms; material changes will be notified in-app or by email, and continued use after changes means you accept them. Questions? Email ",
          after: ".",
        },
      },
    },
    cookies: {
      title: "Cookie Policy",
      metaDescription: "How and why ReelSpy uses cookies and local storage.",
      updatedDate: "2026-06-15",
      intro:
        "This Cookie Policy explains how ReelSpy uses cookies and similar technologies (such as browser local storage) to recognize you when you use our application.",
      sections: {
        whatAreCookies: {
          heading: "What are cookies?",
          body: "Cookies are small text files placed on your device when you visit a website. They are widely used to make applications work, to keep you signed in, and to remember your preferences.",
        },
        howWeUse: {
          heading: "How we use cookies",
          table: { type: "Type", purpose: "Purpose" },
          essential: {
            label: "Essential",
            body: "Authentication and session cookies that keep you signed in and secure your account. The app cannot function without these.",
          },
          preferences: {
            label: "Preferences",
            body: "Remember choices like your color theme, feed layout, and your cookie-consent decision. Stored in your browser’s local storage and cookies.",
          },
          note: "We do not currently use third-party advertising or tracking cookies.",
        },
        managingChoices: {
          heading: "Managing your choices",
          body: "When you first visit ReelSpy, a banner lets you accept or reject non-essential cookies. You can change your decision at any time by clearing your browser storage for this site. Most browsers also let you block or delete cookies through their settings, though blocking essential cookies may stop you from signing in.",
        },
        moreInfo: {
          heading: "More information",
          before: "For details on how we handle your personal data, see our ",
          middle: ". Questions? Email ",
          after: ".",
        },
      },
    },
  },
};

export type LegalDict = typeof en;
export const legalEn = en;

export const legalAr: LegalDict = {
  legal: {
    common: {
      back: "رجوع",
      lastUpdated: (date: string) => `آخر تحديث: ${date}`,
      termsOfService: "شروط الخدمة",
      privacyPolicy: "سياسة الخصوصية",
      cookiePolicy: "سياسة ملفات تعريف الارتباط",
    },
    privacy: {
      title: "سياسة الخصوصية",
      metaDescription: "كيف تجمع ريل سباي بياناتك وتستخدمها وتحميها.",
      updatedDate: "2026-07-03",
      intro:
        "توضّح سياسة الخصوصية هذه كيفية قيام ريل سباي («نحن») بجمع معلوماتك واستخدامها وحمايتها عند استخدامك لتطبيق ريل سباي. باستخدامك ريل سباي، فإنك توافق على الممارسات الموضحة في هذه السياسة.",
      sections: {
        collection: {
          heading: "1. المعلومات التي نجمعها",
          items: {
            account: {
              label: "بيانات الحساب.",
              body: "عنوان بريدك الإلكتروني ومعرّفات المصادقة الخاصة بك عند إنشاء حساب أو تسجيل الدخول (بما في ذلك عبر جوجل).",
            },
            instagram: {
              label: "بيانات إنستغرام.",
              body: "عند ربط حساب إنستغرام الخاص بك، نصل إلى تفاصيل الملف الشخصي والمنشورات والإحصاءات التي تُصرّح بها عبر واجهة Graph API الخاصة بميتا، وذلك لتشغيل صفحة المحتوى الخاصة بك وتحليلاتك.",
            },
            usage: {
              label: "الاستخدام والتفضيلات.",
              body: "إعدادات مثل المظهر، وتخطيط المحتوى، والحسابات المتابَعة، تُحفظ لتخصيص تجربتك.",
            },
          },
        },
        use: {
          heading: "2. كيف نستخدم معلوماتك",
          intro: "نستخدم معلوماتك من أجل:",
          items: [
            "توفير خدمة ريل سباي وصيانتها وتحسينها.",
            "التحقق من هويتك والحفاظ على أمان حسابك.",
            "مزامنة محتوى إنستغرام وإحصاءات الأداء وعرضها.",
            "تذكّر تفضيلاتك عبر الجلسات المختلفة.",
          ],
        },
        instagramPlatform: {
          heading: "3. بيانات إنستغرام ومنصة ميتا",
          body: "تستخدم ريل سباي واجهة Graph API الخاصة بميتا. تُخزَّن رموز الوصول بشكل آمن وتُستخدم فقط لتنفيذ الإجراءات التي تطلبها. لا نبيع بيانات إنستغرام الخاصة بك. يمكنك فصل حساب إنستغرام في أي وقت من الإعدادات، مما يؤدي إلى إزالة الرمز المخزَّن.",
        },
        subprocessors: {
          heading: "4. مزوّدو الخدمة (الجهات المعالِجة الفرعية)",
          intro:
            "نعتمد على الجهات الخارجية التالية لمعالجة البيانات من أجل تشغيل ريل سباي. تتلقى كل جهة البيانات اللازمة لوظيفتها فقط، بموجب التزاماتها الخاصة بالأمان والخصوصية:",
          providers: {
            supabase: { label: "Supabase", body: "قاعدة البيانات والمصادقة وتخزين الملفات." },
            vercel: { label: "Vercel", body: "استضافة التطبيق وتوصيله." },
            cloudflareR2: {
              label: "Cloudflare R2",
              body: "تخزين مقاطع الفيديو التي ترفعها للنشر.",
            },
            stripe: {
              label: "Stripe",
              body: "معالجة المدفوعات والاشتراكات (لا نخزّن بيانات بطاقتك أبدًا).",
            },
            aiModels: {
              label: "Anthropic وNVIDIA",
              body: "نماذج الذكاء الاصطناعي التي تُنشئ النصوص والاقتراحات بناءً على المدخلات التي تقدّمها.",
            },
            transcription: {
              label: "Groq وHugging Face",
              body: "تفريغ صوتي إلى نص للريلز التي تختار تفريغها.",
            },
            platforms: {
              label: "ميتا (إنستغرام وفيسبوك) وجوجل (يوتيوب وتسجيل الدخول)",
              body: "المنصات التي تربطها وتنشر عليها عبر واجهاتها البرمجية.",
            },
            resend: {
              label: "Resend",
              body: "البريد الإلكتروني التشغيلي (مثل إشعارات فشل النشر).",
            },
          },
          outro:
            "نحن لا نبيع بياناتك الشخصية، ولا نشاركها مع أطراف ثالثة باستثناء الجهات المعالِجة المذكورة أعلاه أو عندما يقتضي القانون ذلك.",
        },
        cookiesSection: {
          heading: "5. ملفات تعريف الارتباط",
          before:
            "نستخدم ملفات تعريف ارتباط أساسية للمصادقة ولتذكّر موافقتك وتفضيلاتك. للاطلاع على التفاصيل، راجع ",
          after: ".",
        },
        retention: {
          heading: "6. الاحتفاظ بالبيانات وحذفها",
          before: "نحتفظ ببياناتك طالما ظل حسابك نشطًا. يمكنك حذف حسابك في أي وقت من ",
          settingsLinkText: "الإعدادات",
          after:
            ". يؤدي الحذف إلى إزالة ملفك الشخصي وجميع البيانات المرتبطة به بشكل نهائي — الحسابات المتابَعة، والريلز، والنصوص، والأتمتة، والفيديوهات المرفوعة، وسجلات الأحداث — وإلغاء أي رمز وصول متصل بميتا. هذا الإجراء فوري ولا يمكن التراجع عنه.",
        },
        rights: {
          heading: "7. حقوقك",
          before:
            "بحسب ولايتك القضائية، قد يكون لك الحق في الوصول إلى بياناتك الشخصية أو تصحيحها أو تصديرها أو حذفها. يمكنك ",
          exportWord: "تصدير",
          middle: " نسخة قابلة للقراءة آليًا من بياناتك و",
          deleteWord: "حذف",
          after: " حسابك بنفسك من الإعدادات، أو التواصل معنا لممارسة أي من هذه الحقوق.",
        },
        security: {
          heading: "8. الأمان والإخطار بالاختراق",
          body: "نحمي رموز الوصول والبيانات الحساسة الأخرى بضوابط وصول مخصّصة للخادم فقط وتشفير أثناء النقل. لا يوجد نظام آمن تمامًا؛ في حال وقوع اختراق للبيانات الشخصية من المرجّح أن يؤثر عليك، سنقوم بإخطار المستخدمين المتضررين والجهة المختصة دون تأخير لا مبرر له، بما يتوافق مع القانون المعمول به.",
        },
        dpo: {
          heading: "9. جهة التواصل لحماية البيانات (قانون حماية البيانات الشخصية الإماراتي)",
          before:
            "تعالج ريل سباي البيانات الشخصية بما يتوافق مع قانون حماية البيانات الشخصية الإماراتي (PDPL). لتقديم طلبات أو أسئلة متعلقة بحماية البيانات — الوصول أو التصحيح أو التصدير أو الحذف أو الاعتراض — تواصل مع مسؤول حماية البيانات لدينا على ",
          after: ".",
        },
      },
    },
    terms: {
      title: "شروط الخدمة",
      metaDescription: "الشروط التي تحكم استخدامك لريل سباي.",
      updatedDate: "2026-07-03",
      intro:
        "تحكم شروط الخدمة هذه («الشروط») وصولك إلى ريل سباي واستخدامك لها («ريل سباي»، «نحن»، «لنا»). بإنشائك لحساب أو استخدامك للخدمة، فإنك توافق على هذه الشروط. إذا كنت لا توافق عليها، فيرجى عدم استخدام ريل سباي.",
      sections: {
        service: {
          heading: "1. الخدمة",
          body: "ريل سباي أداة لبحث المحتوى وإنشائه موجهة لصنّاع المحتوى على منصات التواصل الاجتماعي. تساعدك على تتبع الريلز وتحليلها، وإنشاء نصوص بمساعدة الذكاء الاصطناعي، وجدولة المحتوى أو نشره على المنصات المرتبطة. تختلف الميزات باختلاف الباقة، وقد تتغير مع تطوّر المنتج.",
        },
        eligibility: {
          heading: "2. الأهلية والحسابات",
          body: "يجب أن يكون عمرك 18 عامًا على الأقل وأن تكون قادرًا على إبرام عقد ملزم. أنت مسؤول عن بيانات اعتماد حسابك وعن كل نشاط يتم تحت حسابك. يجب عليك تقديم معلومات دقيقة وإبقاؤها محدّثة.",
        },
        billing: {
          heading: "3. الباقات والفوترة والتجديد",
          items: [
            "تُفوتر الباقات المدفوعة (Creator وPro وStudio) مقدمًا وعلى أساس شهري متكرر عبر معالج الدفع الخاص بنا، Stripe. تُعرض الأسعار عند الدفع.",
            "يتجدد اشتراكك تلقائيًا في كل دورة حتى تُلغيه. يمكنك الإلغاء في أي وقت من بوابة الفوترة؛ يوقف الإلغاء الرسوم المستقبلية، بينما يستمر وصولك المدفوع حتى نهاية الفترة الحالية.",
            "يجوز لنا تغيير الأسعار أو حدود الباقات مع إشعار معقول مسبق. تسري التغييرات عند تجديدك التالي.",
          ],
        },
        refunds: {
          heading: "4. الاسترداد",
          before: "إذا لم تكن راضيًا، راسلنا عبر البريد الإلكتروني ",
          afterEmail: " خلال ",
          windowWord: "7 أيام",
          after:
            " من أول دفعة لك على إحدى الباقات، وسنسترد لك تلك الدفعة بالكامل. بعد انقضاء هذه المهلة، تكون الدفعات التي تمت غير قابلة للاسترداد، إلا أنه يمكنك الإلغاء في أي وقت لتفادي أي رسوم مستقبلية. لا شيء هنا يحد من أي حقوق قد تتمتع بها بموجب قانون حماية المستهلك المعمول به.",
        },
        acceptableUse: {
          heading: "5. الاستخدام المقبول",
          intro: "أنت توافق على عدم القيام بما يلي:",
          items: [
            "مخالفة شروط أو سياسات أي منصة مرتبطة (إنستغرام، فيسبوك، تيك توك، يوتيوب) أو القانون المعمول به.",
            "نشر محتوى غير قانوني أو ينتهك حقوق الغير أو مضلّل أو ضار.",
            "محاولة الهندسة العكسية للخدمة، أو إثقالها، أو كشط بياناتها، أو الالتفاف على حدود الاستخدام أو إجراءاتها الأمنية.",
            "إعادة بيع صلاحية الوصول إلى حسابك أو مشاركتها دون إذن منا.",
          ],
        },
        yourContent: {
          heading: "6. محتواك",
          body: "تحتفظ بملكية المحتوى الذي ترفعه أو تُنشئه أو تنشره عبر ريل سباي. وأنت تمنحنا الترخيص المحدود اللازم لتخزين ذلك المحتوى ومعالجته ونقله لتشغيل الخدمة (على سبيل المثال، إرسال فيديو إلى منصة اخترت النشر عليها). أنت المسؤول عن المحتوى الذي تنشره وعن امتلاكك للحقوق اللازمة له.",
        },
        aiOutput: {
          heading: "7. المخرجات المُنشأة بالذكاء الاصطناعي",
          body: "تُنتَج النصوص والاقتراحات بمساعدة نماذج ذكاء اصطناعي من أطراف ثالثة وتُقدَّم كمسودات. قد تكون المخرجات غير دقيقة أو تشبه مواد أخرى؛ وأنت المسؤول عن مراجعة أي محتوى وتحريره قبل نشره. لا تضمن ريل سباي تحقيق أي مدى انتشار أو تفاعل أو نتيجة عمل معينة.",
        },
        thirdPartyPlatforms: {
          heading: "8. المنصات الخارجية",
          body: "تتصل ريل سباي بالمنصات التي تُصرّح بها عبر واجهاتها البرمجية الرسمية. يبقى استخدامك لتلك المنصات خاضعًا لشروطها الخاصة، وتوافرها أو تغييرات واجهاتها البرمجية خارجة عن سيطرتنا. نحن غير مسؤولين عن أي إجراءات تتخذها تلك المنصات على حسابك.",
        },
        cancellation: {
          heading: "9. الإلغاء والإنهاء",
          before:
            "يمكنك التوقف عن استخدام ريل سباي وحذف حسابك في أي وقت من الإعدادات، مما يزيل بياناتك على النحو الموضح في ",
          after:
            ". يجوز لنا تعليق الوصول أو إنهاءه إذا خالفت هذه الشروط أو استخدمت الخدمة بطريقة تعرّض الآخرين أو المنصات التي نتكامل معها للخطر.",
        },
        disclaimers: {
          heading: "10. إخلاء المسؤولية والمسؤولية القانونية",
          body: "تُقدَّم الخدمة «كما هي» دون أي ضمانات من أي نوع. إلى أقصى حد يسمح به القانون، لا تتحمل ريل سباي مسؤولية الأضرار غير المباشرة أو العرضية أو التبعية، وتقتصر مسؤوليتنا الإجمالية عن أي مطالبة على المبلغ الذي دفعته لنا خلال الأشهر الثلاثة السابقة للمطالبة.",
        },
        governingLaw: {
          heading: "11. القانون الحاكم",
          body: "تخضع هذه الشروط لقوانين دولة الإمارات العربية المتحدة، بصرف النظر عن مبادئ تنازع القوانين. تختص محاكم دولة الإمارات العربية المتحدة بالنظر في أي نزاعات.",
        },
        changes: {
          heading: "12. التغييرات والتواصل",
          before:
            "يجوز لنا تحديث هذه الشروط؛ وسيتم إخطارك بالتغييرات الجوهرية داخل التطبيق أو عبر البريد الإلكتروني، ويعني استمرارك في استخدام الخدمة بعد التغييرات موافقتك عليها. لديك أسئلة؟ راسلنا عبر البريد الإلكتروني ",
          after: ".",
        },
      },
    },
    cookies: {
      title: "سياسة ملفات تعريف الارتباط",
      metaDescription: "كيف ولماذا تستخدم ريل سباي ملفات تعريف الارتباط والتخزين المحلي.",
      updatedDate: "2026-06-15",
      intro:
        "توضح سياسة ملفات تعريف الارتباط هذه كيفية استخدام ريل سباي لملفات تعريف الارتباط والتقنيات المشابهة (مثل التخزين المحلي للمتصفح) للتعرف عليك عند استخدامك لتطبيقنا.",
      sections: {
        whatAreCookies: {
          heading: "ما هي ملفات تعريف الارتباط؟",
          body: "ملفات تعريف الارتباط هي ملفات نصية صغيرة تُوضع على جهازك عند زيارتك لموقع إلكتروني. تُستخدم على نطاق واسع لتشغيل التطبيقات، وإبقائك مسجّلاً للدخول، وتذكّر تفضيلاتك.",
        },
        howWeUse: {
          heading: "كيف نستخدم ملفات تعريف الارتباط",
          table: { type: "النوع", purpose: "الغرض" },
          essential: {
            label: "أساسية",
            body: "ملفات تعريف ارتباط للمصادقة والجلسات تُبقيك مسجّلاً للدخول وتؤمّن حسابك. لا يمكن للتطبيق العمل بدونها.",
          },
          preferences: {
            label: "التفضيلات",
            body: "تتذكر اختيارات مثل مظهر الألوان، وتخطيط المحتوى، وقرارك بشأن موافقة ملفات تعريف الارتباط. تُخزَّن في التخزين المحلي لمتصفحك وملفات تعريف الارتباط.",
          },
          note: "لا نستخدم حاليًا ملفات تعريف ارتباط إعلانية أو تتبعية من أطراف ثالثة.",
        },
        managingChoices: {
          heading: "إدارة اختياراتك",
          body: "عند زيارتك لريل سباي لأول مرة، يتيح لك شريط إشعار قبول ملفات تعريف الارتباط غير الأساسية أو رفضها. يمكنك تغيير قرارك في أي وقت بمسح تخزين المتصفح الخاص بهذا الموقع. تتيح لك معظم المتصفحات أيضًا حظر ملفات تعريف الارتباط أو حذفها من خلال إعداداتها، مع أن حظر الملفات الأساسية قد يمنعك من تسجيل الدخول.",
        },
        moreInfo: {
          heading: "مزيد من المعلومات",
          before: "لمزيد من التفاصيل حول كيفية تعاملنا مع بياناتك الشخصية، راجع ",
          middle: ". لديك أسئلة؟ راسلنا عبر البريد الإلكتروني ",
          after: ".",
        },
      },
    },
  },
};
