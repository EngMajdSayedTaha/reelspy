// Shared logic behind the /admin/plans routes: the row shape the console
// renders, the subscriber counts every guardrail is decided on, and the
// guardrails themselves.
//
// The guardrails live here rather than in the route handlers because they are
// the interesting part — a plan catalog that can be edited freely is a catalog
// that can silently break paying customers. The rules:
//
//   - a slug is IMMUTABLE once any subscription references it, because it is
//     stored verbatim in subscriptions.tier;
//   - there is no delete, only archive, for the same reason;
//   - archiving a plan that still has subscribers is allowed (hidden to new
//     buyers, still served to existing ones — the normal end state for a
//     retired plan) but the caller must know the count first;
//   - publishing requires English copy and, for a paid plan, a price;
//   - lowering an entitlement is allowed but reported, because entitlements —
//     unlike prices — are NOT grandfathered: they resolve live from the catalog,
//     so a cut applies to existing subscribers on their next page load.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ACTIVE_STATUSES } from "@/lib/billing/subscription";
import { coerceEntitlements, type Entitlements, type EntitlementKey } from "@/lib/billing/entitlements";
import { LOCALES, type Locale } from "@/lib/i18n/config";

export type AdminPlanCopy = {
  name: string;
  tagline: string;
  highlights: string[];
  badge: string | null;
};

export type AdminPlanPrice = {
  id: string;
  interval: "month" | "year";
  currency: string;
  unitAmount: number;
  compareAtAmount: number | null;
  saleEndsAt: string | null;
  stripePriceId: string;
  isCurrent: boolean;
  createdAt: string;
  /** Active subscribers still billing on this exact price. */
  subscribers: number;
};

export type AdminPlanRow = {
  id: string;
  slug: string;
  kind: string;
  status: string;
  sortOrder: number;
  entitlements: Entitlements | null;
  trialDays: number;
  defaultCurrency: string;
  stripeProductId: string | null;
  adminGrant: boolean;
  copy: Record<Locale, AdminPlanCopy>;
  prices: AdminPlanPrice[];
  /** Active subscribers on this plan, whatever price they're on. */
  subscribers: number;
  /** True once any subscription references the slug — the slug is then frozen. */
  slugLocked: boolean;
};

// How many ACTIVE subscribers sit on each plan slug, and on each exact Stripe
// price. One query answers both, and every guardrail below is decided on it.
export async function subscriberCounts(
  admin: SupabaseClient
): Promise<{ byTier: Map<string, number>; byPrice: Map<string, number>; everSeenTiers: Set<string> }> {
  const byTier = new Map<string, number>();
  const byPrice = new Map<string, number>();
  const everSeenTiers = new Set<string>();

  const { data } = await admin.from("subscriptions").select("tier, status, stripe_price_id");
  for (const row of (data ?? []) as { tier: string; status: string; stripe_price_id: string | null }[]) {
    // "Has anyone ever been on this plan" freezes the slug, and that must count
    // cancelled subscribers too: their row still stores the slug.
    if (row.tier) everSeenTiers.add(row.tier);
    if (!ACTIVE_STATUSES.has(row.status)) continue;
    byTier.set(row.tier, (byTier.get(row.tier) ?? 0) + 1);
    if (row.stripe_price_id) {
      byPrice.set(row.stripe_price_id, (byPrice.get(row.stripe_price_id) ?? 0) + 1);
    }
  }
  return { byTier, byPrice, everSeenTiers };
}

type PlanRecord = {
  id: string;
  slug: string;
  kind: string;
  status: string;
  sort_order: number;
  entitlements: unknown;
  trial_days: number | null;
  default_currency: string | null;
  stripe_product_id: string | null;
  admin_grant: boolean | null;
};

type CopyRecord = {
  plan_id: string;
  locale: string;
  name: string;
  tagline: string | null;
  highlights: unknown;
  badge: string | null;
};

type PriceRecord = {
  id: string;
  plan_id: string;
  interval: string;
  currency: string;
  unit_amount: number;
  compare_at_amount: number | null;
  sale_ends_at: string | null;
  stripe_price_id: string;
  is_current: boolean;
  created_at: string;
};

const EMPTY_COPY: AdminPlanCopy = { name: "", tagline: "", highlights: [], badge: null };

// Every plan the console shows — drafts and archived ones included, because the
// admin needs to see and revive exactly those.
export async function listAdminPlans(admin: SupabaseClient): Promise<AdminPlanRow[]> {
  const [planRes, copyRes, priceRes, counts] = await Promise.all([
    admin
      .from("plans")
      .select(
        "id, slug, kind, status, sort_order, entitlements, trial_days, default_currency, stripe_product_id, admin_grant"
      )
      .order("sort_order", { ascending: true }),
    admin.from("plan_copy").select("plan_id, locale, name, tagline, highlights, badge"),
    admin
      .from("plan_prices")
      .select(
        "id, plan_id, interval, currency, unit_amount, compare_at_amount, sale_ends_at, stripe_price_id, is_current, created_at"
      )
      .order("created_at", { ascending: false }),
    subscriberCounts(admin),
  ]);

  if (planRes.error) throw new Error(planRes.error.message);

  const copyByPlan = new Map<string, Partial<Record<Locale, AdminPlanCopy>>>();
  for (const row of (copyRes.data ?? []) as CopyRecord[]) {
    if (!LOCALES.includes(row.locale as Locale)) continue;
    const entry = copyByPlan.get(row.plan_id) ?? {};
    entry[row.locale as Locale] = {
      name: row.name,
      tagline: row.tagline ?? "",
      highlights: Array.isArray(row.highlights)
        ? row.highlights.filter((h): h is string => typeof h === "string")
        : [],
      badge: row.badge ?? null,
    };
    copyByPlan.set(row.plan_id, entry);
  }

  const pricesByPlan = new Map<string, AdminPlanPrice[]>();
  for (const row of (priceRes.data ?? []) as PriceRecord[]) {
    const price: AdminPlanPrice = {
      id: row.id,
      interval: row.interval === "year" ? "year" : "month",
      currency: row.currency,
      unitAmount: row.unit_amount,
      compareAtAmount: row.compare_at_amount,
      saleEndsAt: row.sale_ends_at,
      stripePriceId: row.stripe_price_id,
      isCurrent: row.is_current,
      createdAt: row.created_at,
      subscribers: counts.byPrice.get(row.stripe_price_id) ?? 0,
    };
    pricesByPlan.set(row.plan_id, [...(pricesByPlan.get(row.plan_id) ?? []), price]);
  }

  return ((planRes.data ?? []) as PlanRecord[]).map((row) => ({
    id: row.id,
    slug: row.slug,
    kind: row.kind,
    status: row.status,
    sortOrder: row.sort_order,
    entitlements: coerceEntitlements(row.entitlements),
    trialDays: row.trial_days ?? 0,
    defaultCurrency: row.default_currency ?? "aed",
    stripeProductId: row.stripe_product_id,
    adminGrant: row.admin_grant === true,
    copy: Object.fromEntries(
      LOCALES.map((locale) => [locale, copyByPlan.get(row.id)?.[locale] ?? EMPTY_COPY])
    ) as Record<Locale, AdminPlanCopy>,
    prices: pricesByPlan.get(row.id) ?? [],
    subscribers: counts.byTier.get(row.slug) ?? 0,
    slugLocked: counts.everSeenTiers.has(row.slug),
  }));
}

// ── guardrails ───────────────────────────────────────────────────────────────

export type Guard = { ok: true } | { ok: false; status: number; error: string };

const ENTITLEMENT_KEYS: EntitlementKey[] = [
  "accounts",
  "scripts_mo",
  "transcripts_mo",
  "automations",
  "publish_targets",
  "ig_connections",
];

// A plan can only go live if a customer would see something coherent: a name in
// the default locale, and — unless it's the free tier or the build-your-own card
// — something to charge.
export function canPublish(plan: AdminPlanRow): Guard {
  if (!plan.copy.en.name.trim()) {
    return { ok: false, status: 409, error: "Add an English plan name before publishing." };
  }
  if (!plan.entitlements) {
    return { ok: false, status: 409, error: "This plan's limits are invalid — fix them before publishing." };
  }
  const needsPrice = plan.kind === "fixed";
  const hasCurrentPrice = plan.prices.some((p) => p.isCurrent && p.currency === plan.defaultCurrency);
  if (needsPrice && !hasCurrentPrice) {
    return {
      ok: false,
      status: 409,
      error: `Set a price in ${plan.defaultCurrency.toUpperCase()} before publishing this plan.`,
    };
  }
  return { ok: true };
}

// Archiving is the ONLY way to retire a plan (there is no delete) and it is
// allowed even with subscribers — they keep being served while the plan
// disappears for new buyers. The free plan is the floor everything falls back
// to, and the admin-grant plan is what admins resolve to, so neither may go.
export function canArchive(plan: AdminPlanRow): Guard {
  if (plan.kind === "free") {
    return { ok: false, status: 409, error: "The free plan can't be archived — it's the fallback for everyone else." };
  }
  if (plan.adminGrant) {
    return {
      ok: false,
      status: 409,
      error: "This is the plan admins resolve to. Point admin access at another plan first.",
    };
  }
  return { ok: true };
}

// Entitlement changes that will affect existing subscribers immediately. Not an
// error — just the thing the admin must be told before they confirm, because
// prices are grandfathered and limits are not.
export function loweredEntitlements(
  before: Entitlements | null,
  after: Entitlements
): EntitlementKey[] {
  if (!before) return [];
  return ENTITLEMENT_KEYS.filter((key) => {
    const from = before[key];
    const to = after[key];
    // -1 is unlimited, so it is never a reduction — but moving AWAY from it is.
    if (from < 0) return to >= 0;
    if (to < 0) return false;
    return to < from;
  });
}
