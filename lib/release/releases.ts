// THE CHANGELOG. This file is the single source of truth for what ReelSpy has
// shipped — the in-app "What's new" page, the one-time dialog, the version pill
// in the sidebar and the public /api/public/changelog endpoint (which the
// marketing site renders at reelspy.dev/changelog) all read from here. There is
// deliberately no second copy in Markdown to drift away from it.
//
// HOW TO ADD A RELEASE — the short version; the full runbook is docs/RELEASING.md
//
//   1. Add the new entry at the TOP of RELEASES (newest first, always).
//   2. Bump `version` in package.json to match. CI fails if they disagree.
//   3. Write the notes for the person paying for ReelSpy, not for us:
//        - Say what changed FOR THEM, in the words they'd use.
//        - "Fixed" is the escape hatch for anything technical — a user does not
//          need to know it was a race in the job queue, only that the thing that
//          looked stuck no longer looks stuck.
//        - No engineering vocabulary. test/release/release-notes.test.ts holds a
//          banned-word list and will fail the build over it.
//   4. Both `en` and `ar` are required — TypeScript will not let you skip one.
//   5. Set `spotlight: true` only when it genuinely deserves to interrupt
//      someone mid-task. A release everybody dismisses teaches them to dismiss
//      the next one.
//
// Entries dated before 2026-08-05 were reconstructed from the project's commit
// history when versioning was introduced, so the dates are real but the
// grouping into releases was drawn retroactively.

import type { Release } from "./types";

export const RELEASES: Release[] = [
  {
    version: "0.13.0",
    date: "2026-08-11",
    spotlight: true,
    title: {
      en: "Account pages, bulk transcripts, and pricing that fits you",
      ar: "صفحات للحسابات، تفريغ جماعي، وتسعير يناسبك",
    },
    summary: {
      en: "Every tracked account now opens into its own page with charts and history. You can turn its entire reel library into text in one go, and billing got a real upgrade — your own currency, yearly pricing, free trials, and sale prices that show what you're saving.",
      ar: "كل حساب تتابعه يفتح الآن على صفحته الخاصة بالرسوم البيانية والسجل. يمكنك تحويل كل مقاطعه إلى نص دفعة واحدة، كما شهدت الفوترة تطويرًا حقيقيًا — عملتك الخاصة، تسعير سنوي، فترات تجربة مجانية، وأسعار تخفيض تُظهر مقدار ما توفّره.",
    },
    changes: [
      {
        kind: "new",
        text: {
          en: "Click into any tracked account to see its own page: growth charts, when it posts, which reels are pulling ahead, and a timeline of what's happened on it.",
          ar: "افتح أي حساب تتابعه لترى صفحته الخاصة: رسوم بيانية للنمو، أوقات نشره، المقاطع الأكثر تفوّقًا، وخط زمني لكل ما جرى فيه.",
        },
      },
      {
        kind: "new",
        text: {
          en: "Turn every reel in an account into text at once instead of one at a time, then download all of it as a single file ready to paste into an AI.",
          ar: "حوّل كل مقاطع الحساب إلى نص دفعة واحدة بدل واحدًا تلو الآخر، ثم حمّلها كملف واحد جاهز للصقه في أي أداة ذكاء اصطناعي.",
        },
      },
      {
        kind: "new",
        text: {
          en: "Prices show in AED, SAR or USD depending on where you are, with a switcher if you'd rather see a different one.",
          ar: "تظهر الأسعار بالدرهم الإماراتي أو الريال السعودي أو الدولار حسب موقعك، مع مبدّل إن أردت عملة أخرى.",
        },
      },
      {
        kind: "new",
        text: {
          en: "Pay yearly instead of monthly on any plan and save — the billing page shows exactly how much before you switch.",
          ar: "ادفع سنويًا بدل شهريًا على أي باقة ووفّر — تعرض صفحة الفوترة المبلغ الذي ستوفّره بالضبط قبل أن تُبدّل.",
        },
      },
      {
        kind: "new",
        text: {
          en: "Some plans now come with a free trial. If yours is ending, you'll get an email first so nothing charges you by surprise.",
          ar: "بعض الباقات صارت تأتي بفترة تجربة مجانية. وإن كانت فترتك على وشك الانتهاء، ستصلك رسالة أولًا حتى لا يُخصم منك شيء بمفاجأة.",
        },
      },
      {
        kind: "new",
        text: {
          en: "Plans on sale show the original price crossed out next to the new one, so you can see exactly what you're saving.",
          ar: "الباقات المخفّضة تعرض السعر الأصلي مشطوبًا بجانب السعر الجديد، لترى بالضبط كم توفّر.",
        },
      },
      {
        kind: "improved",
        text: {
          en: "If a plan's price ever changes for new customers, yours stays the same for as long as you keep it — and if it ever has to move, you'll hear the new price and date at least a month ahead.",
          ar: "إن تغيّر سعر أي باقة للعملاء الجدد، يبقى سعرك أنت كما هو ما دمت مشتركًا — وإن اضطر للتغيير يومًا، ستُبلَّغ بالسعر الجديد وتاريخه قبل شهر على الأقل.",
        },
      },
      {
        kind: "improved",
        text: {
          en: "The Hook Library and your saved hooks now load a page at a time, so long lists open faster.",
          ar: "مكتبة الجمل الافتتاحية وجملك المحفوظة تُحمَّل الآن صفحة صفحة، فتفتح القوائم الطويلة أسرع.",
        },
      },
      {
        kind: "improved",
        text: {
          en: "Passwords can no longer be something too common or something that contains your email, so your account is harder to break into.",
          ar: "لم يعد بإمكانك استخدام كلمة مرور شائعة جدًا أو تحتوي على بريدك الإلكتروني، ليصعب اختراق حسابك.",
        },
      },
      {
        kind: "improved",
        text: {
          en: "Signing up now confirms your email address, and if there's a waiting list, you'll know exactly where you stand.",
          ar: "التسجيل صار يؤكّد بريدك الإلكتروني الآن، وإن وُجدت قائمة انتظار، ستعرف بالضبط أين موقعك فيها.",
        },
      },
      {
        kind: "fixed",
        text: {
          en: "Transcribing a whole account in bulk no longer slows down transcribing a single reel by hand or the automatic one — each now runs at its own pace.",
          ar: "تفريغ حساب كامل دفعة واحدة لم يعد يُبطئ تفريغ مقطع واحد يدويًا أو التفريغ التلقائي — كل منها يعمل بوتيرته الخاصة الآن.",
        },
      },
      {
        kind: "fixed",
        text: {
          en: "A rare billing hiccup that could quietly drop a paying subscriber back to the Free plan can no longer happen.",
          ar: "لن يحدث بعد الآن ذلك الخلل النادر في الفوترة الذي كان قد يُعيد مشتركًا يدفع إلى الباقة المجانية بصمت.",
        },
      },
      {
        kind: "fixed",
        text: {
          en: "Dropdown menus no longer appear behind other things on the page.",
          ar: "القوائم المنسدلة لم تعد تظهر خلف عناصر أخرى في الصفحة.",
        },
      },
      {
        kind: "fixed",
        text: {
          en: "Links in emails from ReelSpy open the right page now instead of sometimes leading to a broken one.",
          ar: "روابط رسائل ReelSpy تفتح الصفحة الصحيحة الآن بدل أن تقود أحيانًا إلى صفحة معطوبة.",
        },
      },
    ],
  },

  {
    version: "0.12.0",
    date: "2026-08-05",
    spotlight: true,
    title: {
      en: "What's new, in plain words",
      ar: "ما الجديد، بكلمات بسيطة",
    },
    summary: {
      en: "ReelSpy now keeps a public record of every update. From today, each new version comes with a short note about what changed for you — no technical language.",
      ar: "أصبح لدى ReelSpy سجل معلن لكل تحديث. ابتداءً من اليوم، يأتي كل إصدار جديد مع ملاحظة قصيرة عمّا تغيّر بالنسبة لك — بلا لغة تقنية.",
    },
    changes: [
      {
        kind: "new",
        text: {
          en: "A What's New page listing every update ReelSpy has shipped since day one, written for people and not for engineers.",
          ar: "صفحة \"ما الجديد\" تعرض كل تحديث أطلقناه منذ اليوم الأول، مكتوبة للناس لا للمهندسين.",
        },
      },
      {
        kind: "new",
        text: {
          en: "The version you're using sits at the bottom of the side menu. Tap it any time to see what changed.",
          ar: "الإصدار الذي تستخدمه ظاهر أسفل القائمة الجانبية. اضغط عليه في أي وقت لترى ما تغيّر.",
        },
      },
      {
        kind: "new",
        text: {
          en: "A short note appears once after a big update, so you never have to go looking for what's different.",
          ar: "تظهر ملاحظة قصيرة مرة واحدة بعد كل تحديث كبير، حتى لا تضطر للبحث عمّا اختلف.",
        },
      },
      {
        kind: "improved",
        text: {
          en: "Every future update will carry its own release note in English and Arabic.",
          ar: "كل تحديث قادم سيحمل ملاحظته الخاصة بالعربية والإنجليزية.",
        },
      },
    ],
  },

  {
    version: "0.11.0",
    date: "2026-08-04",
    spotlight: true,
    title: {
      en: "An account's full history",
      ar: "السجل الكامل لأي حساب",
    },
    summary: {
      en: "You can now pull everything an account has ever posted, not just its recent reels — and take the whole thing with you as a spreadsheet.",
      ar: "يمكنك الآن سحب كل ما نشره أي حساب على الإطلاق، لا آخر مقاطعه فقط — وتحميله كاملًا كجدول بيانات.",
    },
    changes: [
      {
        kind: "new",
        text: {
          en: "Pull an account's entire reel history instead of only its latest posts. If it stops partway, it picks up where it left off.",
          ar: "اسحب السجل الكامل لمقاطع أي حساب بدلًا من آخر منشوراته فقط. وإن توقّف في المنتصف، يكمل من حيث انتهى.",
        },
      },
      {
        kind: "new",
        text: {
          en: "Download that history as a spreadsheet to keep or share.",
          ar: "حمّل ذلك السجل كجدول بيانات للاحتفاظ به أو مشاركته.",
        },
      },
      {
        kind: "fixed",
        text: {
          en: "Connecting Instagram from a phone works now. It used to dead-end before you could finish.",
          ar: "ربط إنستغرام من الهاتف يعمل الآن. كان يتوقّف عند طريق مسدود قبل أن تُكمل.",
        },
      },
      {
        kind: "fixed",
        text: {
          en: "A missing or broken profile picture shows a clean placeholder instead of an empty square.",
          ar: "صورة الملف الشخصي المفقودة أو المعطوبة تظهر الآن كصورة بديلة أنيقة بدل مربّع فارغ.",
        },
      },
      {
        kind: "fixed",
        text: {
          en: "A history pull that runs into trouble now tells you what went wrong instead of quietly trying forever.",
          ar: "عند تعثّر سحب السجل، يخبرك الآن بما حدث بدل أن يعيد المحاولة بصمت إلى ما لا نهاية.",
        },
      },
    ],
  },

  {
    version: "0.10.0",
    date: "2026-07-31",
    spotlight: true,
    title: {
      en: "Fair plan changes",
      ar: "تغيير الباقة بإنصاف",
    },
    summary: {
      en: "Upgrades start immediately and only charge the difference. Downgrades wait for your next renewal, so you never lose time you already paid for.",
      ar: "الترقية تبدأ فورًا ولا تُحتسب عليك سوى الفرق. أما التخفيض فينتظر تجديدك القادم، فلا تخسر وقتًا دفعت ثمنه.",
    },
    changes: [
      {
        kind: "new",
        text: {
          en: "Sign up with a 6-digit code emailed to you. No leaving the page, no link that expires before you open it.",
          ar: "أنشئ حسابك برمز من ٦ أرقام يصلك بالبريد. لا مغادرة للصفحة، ولا رابط ينتهي قبل أن تفتحه.",
        },
      },
      {
        kind: "improved",
        text: {
          en: "Upgrade and it applies right away — you pay only the difference for the days left in the month.",
          ar: "عند الترقية تُطبَّق فورًا — وتدفع فرق السعر عن الأيام المتبقية من الشهر فقط.",
        },
      },
      {
        kind: "improved",
        text: {
          en: "Move to a smaller plan and it starts at your next renewal, so the month you already paid for stays yours.",
          ar: "عند الانتقال إلى باقة أصغر يبدأ التغيير مع تجديدك القادم، فيبقى الشهر المدفوع من حقك.",
        },
      },
      {
        kind: "improved",
        text: {
          en: "Before you confirm a plan change you see the exact amount you'll be charged.",
          ar: "قبل تأكيد تغيير الباقة ترى المبلغ الدقيق الذي سيُخصم منك.",
        },
      },
      {
        kind: "improved",
        text: {
          en: "Every email ReelSpy sends now looks the same and carries the logo, so you can tell it's really us.",
          ar: "كل رسالة يرسلها ReelSpy صارت بالشكل نفسه وتحمل الشعار، لتعرف أنها منّا فعلًا.",
        },
      },
      {
        kind: "fixed",
        text: {
          en: "Background refreshes no longer stall during Instagram's hourly quiet period.",
          ar: "لم يعد التحديث في الخلفية يتوقّف خلال فترة الهدوء التي يفرضها إنستغرام كل ساعة.",
        },
      },
    ],
  },

  {
    version: "0.9.0",
    date: "2026-07-25",
    spotlight: true,
    title: {
      en: "A home of its own",
      ar: "عنوان خاص بالتطبيق",
    },
    summary: {
      en: "The app moved to app.reelspy.dev and reelspy.dev became the website you show people. Payments also learned how to send you a real receipt.",
      ar: "انتقل التطبيق إلى app.reelspy.dev وأصبح reelspy.dev هو الموقع الذي تعرضه للآخرين. كما صارت المدفوعات ترسل لك إيصالًا حقيقيًا.",
    },
    changes: [
      {
        kind: "new",
        text: {
          en: "The app lives at app.reelspy.dev now, and reelspy.dev is the public website. You stay signed in through the move.",
          ar: "صار التطبيق على app.reelspy.dev، وreelspy.dev هو الموقع العام. وتبقى مسجّلًا للدخول رغم النقل.",
        },
      },
      {
        kind: "new",
        text: {
          en: "A welcome note and a receipt land in your inbox on your first payment.",
          ar: "تصلك رسالة ترحيب وإيصال عند أول دفعة.",
        },
      },
      {
        kind: "new",
        text: {
          en: "You get told when a payment fails, when you cancel, and when a refund goes through — no more guessing.",
          ar: "نخبرك عند تعذّر الدفع، وعند الإلغاء، وعند إتمام الاسترجاع — بلا تخمين.",
        },
      },
      {
        kind: "improved",
        text: {
          en: "Signing in is safer now that the app and the website no longer share one address.",
          ar: "صار تسجيل الدخول أكثر أمانًا بعد أن لم يعد التطبيق والموقع يتشاركان عنوانًا واحدًا.",
        },
      },
      {
        kind: "improved",
        text: {
          en: "The feed opens with the newest reels first.",
          ar: "تفتح الصفحة على أحدث المقاطع أولًا.",
        },
      },
      {
        kind: "fixed",
        text: {
          en: "The plan shown in the side menu is the plan you actually pay for.",
          ar: "الباقة الظاهرة في القائمة الجانبية هي الباقة التي تدفع ثمنها فعلًا.",
        },
      },
      {
        kind: "fixed",
        text: {
          en: "The gauge next to Sync now shows how much you have left, and a stuck sync clears itself.",
          ar: "المؤشّر بجانب المزامنة صار يعرض ما تبقّى لك، والمزامنة المتعثّرة تُنهي نفسها.",
        },
      },
    ],
  },

  {
    version: "0.8.0",
    date: "2026-07-16",
    title: {
      en: "Never start from an empty feed",
      ar: "لا تبدأ من صفحة فارغة",
    },
    summary: {
      en: "A brand-new account now gets real accounts to track from day one, matched to its niche — plus a calmer look and a faster Sync all.",
      ar: "الحساب الجديد صار يحصل على حسابات حقيقية يتابعها من أول يوم، مختارة حسب مجاله — مع مظهر أهدأ ومزامنة شاملة أسرع.",
    },
    changes: [
      {
        kind: "new",
        text: {
          en: "Suggested accounts matched to your niche, drawn from a curated pool covering 118 niches.",
          ar: "حسابات مقترحة تناسب مجالك، مختارة من قائمة منسّقة تغطي ١١٨ مجالًا.",
        },
      },
      {
        kind: "new",
        text: {
          en: "Sync all runs in the background — you can keep working while it finishes.",
          ar: "المزامنة الشاملة تعمل في الخلفية — يمكنك متابعة عملك ريثما تنتهي.",
        },
      },
      {
        kind: "improved",
        text: {
          en: "A new look: a calmer palette, a redesigned logo and a layout that behaves properly on phones.",
          ar: "مظهر جديد: ألوان أهدأ، وشعار مُعاد تصميمه، وتنسيق يعمل كما ينبغي على الهاتف.",
        },
      },
      {
        kind: "improved",
        text: {
          en: "The daily Instagram allowance grows as more people use ReelSpy, so syncs stop hitting the ceiling.",
          ar: "الحصة اليومية من إنستغرام تتّسع كلما زاد مستخدمو ReelSpy، فتتوقّف المزامنة عن الاصطدام بالحد الأقصى.",
        },
      },
      {
        kind: "fixed",
        text: {
          en: "Sign-up tells you when your email is already registered instead of pretending it sent something.",
          ar: "التسجيل يخبرك أن بريدك مُسجَّل مسبقًا بدل أن يتظاهر بإرسال شيء.",
        },
      },
      {
        kind: "fixed",
        text: {
          en: "The guided tour is complete and consistent on every page.",
          ar: "الجولة الإرشادية صارت كاملة ومتّسقة في كل صفحة.",
        },
      },
    ],
  },

  {
    version: "0.7.0",
    date: "2026-07-10",
    spotlight: true,
    title: {
      en: "Arabic, end to end",
      ar: "العربية من الألف إلى الياء",
    },
    summary: {
      en: "The whole app speaks Arabic and reads right to left — including the scripts it writes for you. Niche Radar also arrived: what's working across your entire niche, not just the accounts you track.",
      ar: "التطبيق كله يتحدّث العربية ويُقرأ من اليمين إلى اليسار — بما في ذلك النصوص التي يكتبها لك. ووصل أيضًا \"رادار المجال\": ما ينجح في مجالك كله، لا في الحسابات التي تتابعها فقط.",
    },
    changes: [
      {
        kind: "new",
        text: {
          en: "The entire app in Arabic, right to left, from the menu to the buttons to the error messages.",
          ar: "التطبيق كاملًا بالعربية ومن اليمين إلى اليسار، من القائمة إلى الأزرار إلى رسائل الخطأ.",
        },
      },
      {
        kind: "new",
        text: {
          en: "Choose Gulf or Modern Standard Arabic for the scripts ReelSpy writes.",
          ar: "اختر اللهجة الخليجية أو العربية الفصحى للنصوص التي يكتبها ReelSpy.",
        },
      },
      {
        kind: "new",
        text: {
          en: "Niche Radar: see what's taking off across your whole niche, not only the accounts on your list.",
          ar: "رادار المجال: شاهد ما ينطلق في مجالك كله، لا في الحسابات المدرجة عندك فقط.",
        },
      },
      {
        kind: "new",
        text: {
          en: "A guided tour on every page, so nothing on screen stays a mystery.",
          ar: "جولة إرشادية في كل صفحة، فلا يبقى شيء على الشاشة غامضًا.",
        },
      },
      {
        kind: "new",
        text: {
          en: "Pick the accent colour the app uses.",
          ar: "اختر لون التمييز الذي يستخدمه التطبيق.",
        },
      },
      {
        kind: "new",
        text: {
          en: "Studio plans can connect more than one Instagram account and switch between them.",
          ar: "باقات Studio تستطيع ربط أكثر من حساب إنستغرام والتبديل بينها.",
        },
      },
      {
        kind: "new",
        text: {
          en: "Build your own plan: set your own limits and watch the price update as you move the sliders.",
          ar: "ابنِ باقتك بنفسك: حدّد حدودك وشاهد السعر يتغيّر مع تحريك المؤشّرات.",
        },
      },
    ],
  },

  {
    version: "0.6.0",
    date: "2026-07-04",
    spotlight: true,
    title: {
      en: "Plans, onboarding, and scripts that sound like you",
      ar: "الباقات والتهيئة ونصوص تشبه صوتك",
    },
    summary: {
      en: "The biggest release so far: paid plans, a guided first run, and an AI that writes from your brand voice and from the actual words in the reel you picked.",
      ar: "أكبر إصدار حتى الآن: باقات مدفوعة، وبداية مُرشَدة، وذكاء اصطناعي يكتب بصوت علامتك ومن كلمات المقطع الذي اخترته فعلًا.",
    },
    changes: [
      {
        kind: "new",
        text: {
          en: "Plans and billing — Free, Creator, Pro, Studio, or a plan you build yourself.",
          ar: "الباقات والاشتراك — مجانية، Creator، Pro، Studio، أو باقة تبنيها بنفسك.",
        },
      },
      {
        kind: "new",
        text: {
          en: "A short setup guide the first time you sign in, so you know what to do first.",
          ar: "دليل إعداد قصير عند أول تسجيل دخول، لتعرف من أين تبدأ.",
        },
      },
      {
        kind: "new",
        text: {
          en: "Tell us your niche, audience and tone once — every script after that sounds like you.",
          ar: "أخبرنا بمجالك وجمهورك ونبرتك مرة واحدة — وكل نص بعدها يشبه صوتك.",
        },
      },
      {
        kind: "new",
        text: {
          en: "Scripts are written from the actual transcript of the reel you picked, not from its caption.",
          ar: "تُكتب النصوص من التفريغ الفعلي للمقطع الذي اخترته، لا من وصفه المكتوب.",
        },
      },
      {
        kind: "new",
        text: {
          en: "An Outperforming score that compares a reel against that account's own normal, so a big account's average post no longer looks like a hit.",
          ar: "مؤشّر \"التفوّق\" يقارن المقطع بمعدّل صاحبه نفسه، فلا يبدو المنشور العادي لحساب كبير وكأنه نجاح باهر.",
        },
      },
      {
        kind: "new",
        text: {
          en: "A weekly email with what's moving in your niche.",
          ar: "رسالة أسبوعية بما يتحرّك في مجالك.",
        },
      },
      {
        kind: "new",
        text: {
          en: "Your top reels get turned into text automatically after a sync.",
          ar: "أفضل مقاطعك تُحوَّل إلى نص تلقائيًا بعد كل مزامنة.",
        },
      },
      {
        kind: "new",
        text: {
          en: "Download everything you've saved, or delete your account and all of its data, whenever you want.",
          ar: "حمّل كل ما حفظته، أو احذف حسابك وكل بياناته، متى شئت.",
        },
      },
      {
        kind: "improved",
        text: {
          en: "Long jobs run in the background instead of making you wait on a spinning screen.",
          ar: "المهام الطويلة تعمل في الخلفية بدل أن تنتظر أمام شاشة تدور.",
        },
      },
    ],
  },

  {
    version: "0.5.0",
    date: "2026-06-29",
    title: {
      en: "Advice on your own account",
      ar: "نصائح على حسابك أنت",
    },
    summary: {
      en: "ReelSpy started reading your own numbers and telling you what to do about them — and stopped depending on any single AI service being healthy.",
      ar: "بدأ ReelSpy يقرأ أرقامك أنت ويخبرك بما تفعله حيالها — وتوقّف عن الاعتماد على خدمة ذكاء اصطناعي واحدة.",
    },
    changes: [
      {
        kind: "new",
        text: {
          en: "Growth Notes: a short read on what's working on your account and what to try next.",
          ar: "ملاحظات النمو: قراءة قصيرة لما ينجح في حسابك وما يستحق التجربة تاليًا.",
        },
      },
      {
        kind: "improved",
        text: {
          en: "Generated scripts are longer and more usable — closer to something you can film as-is.",
          ar: "النصوص المُولَّدة صارت أطول وأصلح للاستخدام — أقرب إلى ما يمكن تصويره كما هو.",
        },
      },
      {
        kind: "improved",
        text: {
          en: "Script writing keeps working even when one AI service is having a bad day.",
          ar: "كتابة النصوص تستمر حتى لو تعطّلت إحدى خدمات الذكاء الاصطناعي.",
        },
      },
      {
        kind: "fixed",
        text: {
          en: "You stay signed in on your phone after we ship an update.",
          ar: "تبقى مسجّلًا للدخول على هاتفك بعد إطلاقنا لأي تحديث.",
        },
      },
      {
        kind: "fixed",
        text: {
          en: "A half-finished answer from the AI no longer quietly turns into a generic script.",
          ar: "الإجابة الناقصة من الذكاء الاصطناعي لم تعد تتحوّل بصمت إلى نص عام لا يخصّك.",
        },
      },
    ],
  },

  {
    version: "0.4.0",
    date: "2026-06-21",
    spotlight: true,
    title: {
      en: "Publish everywhere",
      ar: "انشر في كل مكان",
    },
    summary: {
      en: "ReelSpy stopped being only a research tool. Write once, preview it as a phone would show it, and post to Instagram, Facebook, TikTok and YouTube.",
      ar: "لم يعد ReelSpy أداة بحث فقط. اكتب مرة، وشاهد المعاينة كما تظهر على الهاتف، وانشر على إنستغرام وفيسبوك وتيك توك ويوتيوب.",
    },
    changes: [
      {
        kind: "new",
        text: {
          en: "Publish to Instagram, Facebook, TikTok and YouTube from one screen.",
          ar: "انشر على إنستغرام وفيسبوك وتيك توك ويوتيوب من شاشة واحدة.",
        },
      },
      {
        kind: "new",
        text: {
          en: "Write a different caption for each platform.",
          ar: "اكتب وصفًا مختلفًا لكل منصّة.",
        },
      },
      {
        kind: "new",
        text: {
          en: "A live phone preview, so you see the post exactly as your audience will.",
          ar: "معاينة حيّة على هيئة هاتف، لترى المنشور كما سيراه جمهورك تمامًا.",
        },
      },
      {
        kind: "new",
        text: {
          en: "One Connections page for every account you've linked.",
          ar: "صفحة \"الربط\" واحدة لكل حساب ربطته.",
        },
      },
      {
        kind: "new",
        text: {
          en: "Auto-Reply now answers YouTube comments too.",
          ar: "الرد الآلي صار يجيب على تعليقات يوتيوب أيضًا.",
        },
      },
      {
        kind: "fixed",
        text: {
          en: "Bigger videos upload without failing halfway.",
          ar: "المقاطع الأكبر تُرفَع دون أن تتعثّر في منتصف الطريق.",
        },
      },
      {
        kind: "fixed",
        text: {
          en: "Scheduled posts show the correct time in your own timezone, and you can edit them after scheduling.",
          ar: "المنشورات المجدولة تعرض الوقت الصحيح بتوقيتك، ويمكنك تعديلها بعد الجدولة.",
        },
      },
    ],
  },

  {
    version: "0.3.0",
    date: "2026-06-12",
    spotlight: true,
    title: {
      en: "Replies on autopilot",
      ar: "ردود تعمل وحدها",
    },
    summary: {
      en: "Comments and messages started answering themselves, and My Instagram grew charts of your own performance.",
      ar: "بدأت التعليقات والرسائل تُجيب نفسها، وصار قسم \"إنستغرامي\" يعرض رسومًا بيانية لأدائك أنت.",
    },
    changes: [
      {
        kind: "new",
        text: {
          en: "Auto-Reply: when someone comments a keyword on your reel, ReelSpy replies and sends them a message automatically.",
          ar: "الرد الآلي: عندما يعلّق أحدهم بكلمة مفتاحية على مقطعك، يردّ ReelSpy ويرسل له رسالة تلقائيًا.",
        },
      },
      {
        kind: "new",
        text: {
          en: "Keyword replies for direct messages as well as comments.",
          ar: "ردود بالكلمات المفتاحية على الرسائل المباشرة كما على التعليقات.",
        },
      },
      {
        kind: "new",
        text: {
          en: "My Instagram: charts of how your own reels are doing, with your numbers available to download.",
          ar: "إنستغرامي: رسوم بيانية لأداء مقاطعك، مع إمكانية تحميل أرقامك.",
        },
      },
      {
        kind: "new",
        text: {
          en: "Import the accounts you already follow instead of adding them one at a time.",
          ar: "استورد الحسابات التي تتابعها أصلًا بدل إضافتها واحدًا واحدًا.",
        },
      },
      {
        kind: "new",
        text: {
          en: "A content calendar you can drag and drop.",
          ar: "تقويم محتوى يمكنك السحب والإفلات فيه.",
        },
      },
      {
        kind: "improved",
        text: {
          en: "My Instagram opens instantly instead of loading every time.",
          ar: "يفتح قسم \"إنستغرامي\" فورًا بدل التحميل في كل مرة.",
        },
      },
    ],
  },

  {
    version: "0.2.0",
    date: "2026-06-08",
    title: {
      en: "A feed you can shape",
      ar: "صفحة محتوى تُشكّلها كما تريد",
    },
    summary: {
      en: "Groups, favourites, a rail for reels picking up speed, and a library for the opening lines that work.",
      ar: "مجموعات، ومفضّلة، وشريط للمقاطع التي تتسارع، ومكتبة للجمل الافتتاحية الناجحة.",
    },
    changes: [
      {
        kind: "new",
        text: {
          en: "Group your accounts and filter the feed by group.",
          ar: "جمّع حساباتك في مجموعات وصفِّ المحتوى حسب المجموعة.",
        },
      },
      {
        kind: "new",
        text: {
          en: "A Rising now rail that surfaces reels picking up speed right this moment.",
          ar: "شريط \"يصعد الآن\" يُبرز المقاطع التي تتسارع في هذه اللحظة.",
        },
      },
      {
        kind: "new",
        text: {
          en: "A Hook Library that collects the opening lines worth reusing.",
          ar: "مكتبة الجمل الافتتاحية تجمع البدايات التي تستحق إعادة الاستخدام.",
        },
      },
      {
        kind: "new",
        text: {
          en: "Mark reels as favourite, or hide the ones you've already worked through.",
          ar: "ضع المقاطع في المفضّلة، أو أخفِ ما انتهيت منه.",
        },
      },
      {
        kind: "improved",
        text: {
          en: "Choose how many reels load per page and how many to pull from each account.",
          ar: "اختر عدد المقاطع في كل صفحة وعدد ما يُسحب من كل حساب.",
        },
      },
      {
        kind: "improved",
        text: {
          en: "The app explains itself when something goes wrong instead of failing quietly.",
          ar: "يشرح التطبيق ما حدث عند حصول خطأ بدل أن يفشل بصمت.",
        },
      },
    ],
  },

  {
    version: "0.1.0",
    date: "2026-06-05",
    title: {
      en: "The first build",
      ar: "النسخة الأولى",
    },
    summary: {
      en: "Where ReelSpy started: track the accounts that inspire you, see their reels ranked in one feed, and turn any reel into text.",
      ar: "من هنا بدأ ReelSpy: تابع الحسابات التي تلهمك، وشاهد مقاطعها مرتّبة في صفحة واحدة، وحوّل أي مقطع إلى نص.",
    },
    changes: [
      {
        kind: "new",
        text: {
          en: "Track the Instagram accounts that inspire you and see their reels together in one feed.",
          ar: "تابع حسابات إنستغرام التي تلهمك وشاهد مقاطعها مجتمعة في صفحة واحدة.",
        },
      },
      {
        kind: "new",
        text: {
          en: "Sort and filter that feed by views, likes and comments, with real view counts.",
          ar: "رتّب المحتوى وصفِّه حسب المشاهدات والإعجابات والتعليقات، بأرقام مشاهدات حقيقية.",
        },
      },
      {
        kind: "new",
        text: {
          en: "Turn any reel into text you can read, search and copy.",
          ar: "حوّل أي مقطع إلى نص يمكنك قراءته والبحث فيه ونسخه.",
        },
      },
    ],
  },
];
