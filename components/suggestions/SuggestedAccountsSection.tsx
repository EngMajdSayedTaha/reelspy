import { cookies } from "next/headers";
import { getSuggestionsForUser } from "@/lib/suggestions/accounts";
import { SuggestedAccountsList } from "@/components/suggestions/SuggestedAccountsList";
import { PREFS_COOKIE, parsePrefs } from "@/lib/prefs";
import { getDictionary } from "@/lib/i18n/dictionaries";

type Props = {
  userId: string;
  /** hero = accounts-page empty state; strip = accounts-page non-empty list;
   *  widget = compact dashboard-home block with a link to the full radar. */
  variant?: "hero" | "strip" | "widget";
  limit?: number;
};

// Data-driven niche suggestions (never a hallucinated handle — every account
// and score comes straight from the Niche Radar aggregate). Async server
// component so callers can stream it in behind a <Suspense> boundary and never
// block the rest of the page on the cross-user query.
export async function SuggestedAccountsSection({ userId, variant = "strip", limit }: Props) {
  const { locale } = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);
  const dict = getDictionary(locale).suggestions;

  const { accounts, niche, fallback, emptyReason } = await getSuggestionsForUser(userId);
  const shown = typeof limit === "number" ? accounts.slice(0, limit) : accounts;

  if (shown.length === 0) {
    // "no-data" on the dashboard widget/strip (not the onboarding hero) is too
    // common pre-launch (fresh niches with no snapshots yet) to be worth a
    // permanent-looking message — only surface the reassuring "all-tracked"
    // case and the hero variant's own empty state.
    if (!emptyReason || (emptyReason === "no-data" && variant !== "hero")) return null;
    return (
      <div className="rounded-xl border border-dashed border-border-strong bg-background p-5 text-sm text-muted-foreground">
        {emptyReason === "all-tracked" ? dict.emptyAllTracked : dict.emptyNoData}
      </div>
    );
  }

  const heading = variant === "hero" ? dict.heroTitle : fallback ? dict.sectionTitleFallback : dict.sectionTitle;
  const activeNiche = fallback ? undefined : (niche ?? undefined);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {heading}
          </h2>
          {variant === "hero" ? (
            <p className="mt-0.5 text-sm text-muted-foreground">{dict.heroSubtitle}</p>
          ) : null}
        </div>
        {variant === "widget" ? (
          <a
            href="/dashboard/trends"
            className="shrink-0 text-xs font-medium text-accent-brand hover:underline"
          >
            {dict.seeMore}
          </a>
        ) : null}
      </div>
      <SuggestedAccountsList accounts={shown} niche={activeNiche} />
    </div>
  );
}
