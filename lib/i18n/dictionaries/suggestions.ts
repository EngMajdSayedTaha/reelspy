// Niche-based viral account suggestions dictionary domain — the empty-state
// hero on the accounts page, the ongoing "suggested for your niche" strip, and
// the compact dashboard-home widget (lib/suggestions/accounts.ts,
// components/suggestions/*). Composed into the root `Dict` by
// lib/i18n/dictionaries/index.ts.

const en = {
  suggestions: {
    heroTitle: "Start with viral accounts in your niche",
    heroSubtitle:
      "Real accounts, real viral scores — pulled straight from ReelSpy's cross-user Niche Radar.",
    sectionTitle: "Suggested for your niche",
    sectionTitleFallback: "Trending across ReelSpy",
    seeMore: "See more in Niche Radar",
    notInterested: "Not interested",
    outperformBadge: (ratio: string) => `${ratio}× above their usual`,
    emptyAllTracked:
      "You're already tracking every top account ReelSpy has spotted in your niche — nice work. New suggestions will show up as more creators join the Niche Radar.",
    emptyNoData:
      "No suggestions yet — ReelSpy needs more tracked accounts and recent reel activity in this niche before it can suggest cross-user accounts.",
    noNicheHint: "Tell us your niche to get tailored account suggestions.",
    noNicheCta: "Set your niche",
  },
};

export type SuggestionsDict = typeof en;
export const suggestionsEn = en;

export const suggestionsAr: SuggestionsDict = {
  suggestions: {
    heroTitle: "ابدأ بحسابات رائجة في مجالك",
    heroSubtitle: "حسابات حقيقية ونتائج انتشار حقيقية — مباشرة من رادار المجال المُجمَّع عبر مستخدمي ReelSpy.",
    sectionTitle: "مقترحة لمجالك",
    sectionTitleFallback: "رائج عبر ReelSpy",
    seeMore: "عرض المزيد في رادار المجال",
    notInterested: "غير مهتم",
    outperformBadge: (ratio: string) => `أعلى بمقدار ${ratio}× من المعتاد`,
    emptyAllTracked:
      "أنت بالفعل تتابع كل حساب رائج رصده ReelSpy في مجالك — عمل رائع. ستظهر اقتراحات جديدة كلما انضم مبدعون آخرون إلى رادار المجال.",
    emptyNoData:
      "لا توجد اقتراحات بعد — يحتاج ReelSpy إلى مزيد من الحسابات المتابَعة ونشاط الريلز الحديث في هذا المجال قبل أن يتمكن من اقتراح حسابات من مستخدمين آخرين.",
    noNicheHint: "أخبرنا بمجالك لنقترح لك حسابات مناسبة.",
    noNicheCta: "حدد مجالك",
  },
};
