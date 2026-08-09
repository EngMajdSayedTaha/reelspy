import { NextResponse } from "next/server";
import { loadCatalog, type PlanCopy } from "@/lib/billing/catalog";
import { LOCALES, type Locale } from "@/lib/i18n/config";

// Public plan catalog — the free/fixed plans an admin has published, in both
// locales, exactly as they appear on /admin/plans. This is what lets the
// marketing zone's pricing section (reelspy-landing) stay in sync with the
// dashboard's own billing page instead of carrying a third hardcoded copy of
// prices and features (see migration 20260809080000_plan_catalog.sql).
//
// The build-your-own ("custom") plan is deliberately excluded: it has no
// fixed price, and the marketing zone renders its own static teaser for it.
//
// Read by our own zone (the landing app fetches this server-side at
// revalidate time — see lib/plans/fetch.ts over there), not by browsers, so
// no CORS headers. loadCatalog() already fails open to the hardcoded catalog
// on any DB error, so this endpoint can't 500 because of a bad migration.
export const runtime = "nodejs";

const CACHE_CONTROL = "public, s-maxage=60, stale-while-revalidate=300";

export type PublicPlanPrice = {
  currency: string;
  unitAmount: number;
  interval: "month" | "year";
  /**
   * The struck-through "was" figure an admin sets alongside a sale price (see
   * PricingSection.tsx). Already nulled by the catalog once sale_ends_at has
   * passed, so a stale strikethrough can never survive an unrun expiry cron.
   */
  compareAtAmount: number | null;
  saleEndsAt: string | null;
};

export type PublicPlan = {
  slug: string;
  kind: "free" | "fixed";
  sortOrder: number;
  /** Days of free trial before billing starts. 0 = none. */
  trialDays: number;
  copy: Record<Locale, PlanCopy>;
  price: PublicPlanPrice | null;
};

export type PublicPlansPayload = { plans: PublicPlan[]; generatedAt: string };

export async function GET() {
  const catalog = await loadCatalog();

  const plans: PublicPlan[] = catalog.plans
    .filter((plan) => plan.kind !== "custom")
    .map((plan) => {
      const price =
        plan.prices.find((p) => p.interval === "month" && p.currency === plan.defaultCurrency) ??
        plan.prices[0] ??
        null;
      return {
        slug: plan.slug,
        kind: plan.kind === "free" ? "free" : "fixed",
        sortOrder: plan.sortOrder,
        trialDays: plan.trialDays,
        copy: Object.fromEntries(LOCALES.map((locale) => [locale, plan.copy[locale]])) as Record<
          Locale,
          PlanCopy
        >,
        price: price
          ? {
              currency: price.currency,
              unitAmount: price.unitAmount,
              interval: price.interval,
              compareAtAmount: price.compareAtAmount,
              saleEndsAt: price.saleEndsAt,
            }
          : null,
      };
    });

  return NextResponse.json(
    { plans, generatedAt: new Date().toISOString() } satisfies PublicPlansPayload,
    { headers: { "Cache-Control": CACHE_CONTROL } }
  );
}
