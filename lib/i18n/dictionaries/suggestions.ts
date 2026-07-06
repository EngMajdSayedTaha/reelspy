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
  },
};
