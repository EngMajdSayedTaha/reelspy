// The plan catalog: what plans exist, what they cost, what they grant, and what
// they're called — read from the database (see migration 20260809080000) instead
// of the hardcoded constants that used to be spread across lib/billing/plans.ts,
// lib/billing/entitlements.ts and lib/i18n/dictionaries/billing.ts.
//
// THREE PROPERTIES MATTER MORE THAN ANYTHING ELSE HERE:
//
//  1. It fails open. Any error — no migration, no rows, a malformed jsonb, a DB
//     blip — returns the fallback catalog built from those same hardcoded
//     constants. Billing infra must never hard-break the product, and it means
//     this can ship before the migration is applied and behave identically.
//
//  2. priceIndex covers EVERY price ever recorded, current or not. Stripe Prices
//     are immutable in amount, so changing a price mints a new one and the old
//     one lives on for every subscriber grandfathered on it. If the reverse
//     lookup only knew current prices, the Stripe webhook would fail to resolve
//     those subscribers' tier on their next renewal. This is the single most
//     load-bearing detail in the file.
//
//  3. It is cached, and staleness is bounded and harmless. The cache can only
//     make a DISPLAYED price up to BILLING_CATALOG_TTL_MS old; the amount
//     actually charged is always resolved server-side against Stripe at
//     checkout, so a stale read can never charge the wrong number.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AiTier } from "@/lib/ai/tier";
import type { Locale } from "@/lib/i18n/config";
import { LOCALES, DEFAULT_LOCALE } from "@/lib/i18n/config";
import {
  coerceEntitlements,
  ENTITLEMENTS,
  type Entitlements,
} from "@/lib/billing/entitlements";
import { PLANS, stripePriceIdForTier } from "@/lib/billing/plans";
import { billingEn, billingAr } from "@/lib/i18n/dictionaries/billing";
import { DEFAULT_CURRENCY, isCurrency, type Currency } from "@/lib/billing/currency";
import { numEnv } from "@/lib/utils/env";
import { coerceCustomRates, type CustomRates } from "@/lib/billing/custom-pricing";

// ── types ────────────────────────────────────────────────────────────────────

export type PlanKind = "free" | "fixed" | "custom";
export type PlanStatus = "draft" | "published" | "archived";
export type BillingInterval = "month" | "year";

export type CatalogPrice = {
  id: string | null;
  stripePriceId: string;
  interval: BillingInterval;
  currency: Currency;
  /** MINOR units — what Stripe charges. */
  unitAmount: number;
  /** The struck-through "was" figure. Null once the sale has ended. */
  compareAtAmount: number | null;
  saleEndsAt: string | null;
  isCurrent: boolean;
};

export type PlanCopy = {
  name: string;
  tagline: string;
  highlights: string[];
  badge: string | null;
};

export type CatalogPlan = {
  /** Null for a fallback-catalog plan, which has no database row. */
  id: string | null;
  slug: string;
  kind: PlanKind;
  status: PlanStatus;
  sortOrder: number;
  entitlements: Entitlements;
  trialDays: number;
  defaultCurrency: Currency;
  stripeProductId: string | null;
  adminGrant: boolean;
  customPricing: Record<string, unknown> | null;
  copy: Record<Locale, PlanCopy>;
  /** CURRENT prices only. Historical prices live in the catalog's priceIndex. */
  prices: CatalogPrice[];
};

export type PriceIndexEntry = {
  slug: string;
  interval: BillingInterval;
  currency: Currency;
  unitAmount: number;
  isCurrent: boolean;
};

export type Catalog = {
  /** Published plans, cheapest-first by sort_order — what customers may buy. */
  plans: CatalogPlan[];
  /** Every non-archived plan, drafts included — what the admin console lists. */
  all: CatalogPlan[];
  bySlug: Map<string, CatalogPlan>;
  /** Published slugs in sort order: the fallback upgrade/downgrade ladder. */
  ladder: string[];
  /** EVERY price ever seen, current or not. See note 2 at the top of the file. */
  priceIndex: Map<string, PriceIndexEntry>;
  /** The plan profiles.is_admin resolves to. */
  adminSlug: string;
  source: "db" | "fallback";
  loadedAt: number;
};

// ── fallback catalog ─────────────────────────────────────────────────────────

// Whether this build ships translated copy for a slug. False for every
// admin-created plan, which is what decides how far the copy fallback reaches.
function hasDictionaryCopy(slug: string): boolean {
  return slug in (billingEn.billing.plans as Record<string, unknown>);
}

function titleCase(slug: string): string {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function copyFromDictionary(slug: string): Record<Locale, PlanCopy> {
  const pick = (dict: typeof billingEn | typeof billingAr): PlanCopy => {
    const plans = dict.billing.plans as Record<string, { name: string; tagline: string; highlights: string[] }>;
    const entry = plans[slug];
    return {
      // Last resort for a slug nobody has written copy for: a readable label
      // rather than a raw identifier in front of a customer.
      name: entry?.name ?? titleCase(slug),
      tagline: entry?.tagline ?? "",
      highlights: entry?.highlights ? [...entry.highlights] : [],
      badge: null,
    };
  };
  return { en: pick(billingEn), ar: pick(billingAr) };
}

// The catalog as it was before any of this existed: the four hardcoded plans,
// their hardcoded entitlements, their dictionary copy, and whatever Stripe Price
// ids the STRIPE_PRICE_* env vars carry. Pure — no database, no throwing — so it
// is always available as the fail-open answer.
export function fallbackCatalog(): Catalog {
  const plans: CatalogPlan[] = PLANS.map((meta, index) => {
    const priceId = stripePriceIdForTier(meta.tier);
    return {
      id: null,
      slug: meta.tier,
      kind: meta.tier === "free" ? "free" : "fixed",
      status: "published",
      sortOrder: (index + 1) * 10,
      entitlements: ENTITLEMENTS[meta.tier] ?? ENTITLEMENTS.free,
      trialDays: 0,
      defaultCurrency: DEFAULT_CURRENCY,
      stripeProductId: null,
      // Admins have always resolved to the top of the ladder.
      adminGrant: meta.tier === "studio",
      customPricing: null,
      copy: copyFromDictionary(meta.tier),
      prices: priceId
        ? [
            {
              id: null,
              stripePriceId: priceId,
              interval: "month",
              currency: DEFAULT_CURRENCY,
              unitAmount: meta.priceAed * 100,
              compareAtAmount: null,
              saleEndsAt: null,
              isCurrent: true,
            },
          ]
        : [],
    };
  });

  // The build-your-own card isn't in PLANS (its price depends on the config) but
  // it is a real plan a subscription can be on, so the catalog must know it.
  plans.push({
    id: null,
    slug: "custom",
    kind: "custom",
    status: "published",
    sortOrder: 999,
    entitlements: ENTITLEMENTS.custom,
    trialDays: 0,
    defaultCurrency: DEFAULT_CURRENCY,
    stripeProductId: process.env.STRIPE_PRODUCT_CUSTOM?.trim() || null,
    adminGrant: false,
    customPricing: null,
    copy: copyFromDictionary("custom"),
    prices: [],
  });

  return assemble(plans, [], "fallback");
}

// ── assembly ─────────────────────────────────────────────────────────────────

// Build the derived views (ordering, lookup maps, the price index) once, so no
// caller has to re-derive them per request. `historical` carries the prices that
// are no longer current — they belong in the index but not on the plan.
function assemble(
  plans: CatalogPlan[],
  historical: { slug: string; price: CatalogPrice }[],
  source: Catalog["source"]
): Catalog {
  const sorted = [...plans].sort((a, b) => a.sortOrder - b.sortOrder || a.slug.localeCompare(b.slug));
  const published = sorted.filter((p) => p.status === "published");

  const priceIndex = new Map<string, PriceIndexEntry>();
  for (const plan of sorted) {
    for (const price of plan.prices) {
      priceIndex.set(price.stripePriceId, {
        slug: plan.slug,
        interval: price.interval,
        currency: price.currency,
        unitAmount: price.unitAmount,
        isCurrent: true,
      });
    }
  }
  for (const { slug, price } of historical) {
    // Current prices win: a historical row must never shadow a live one.
    if (priceIndex.has(price.stripePriceId)) continue;
    priceIndex.set(price.stripePriceId, {
      slug,
      interval: price.interval,
      currency: price.currency,
      unitAmount: price.unitAmount,
      isCurrent: false,
    });
  }

  // Env price ids are merged at LOWER priority than anything the database knows,
  // so a deployment mid-migration (rows written, env still set, or vice versa)
  // resolves either way instead of dropping a subscriber's tier.
  for (const meta of PLANS) {
    const envPriceId = stripePriceIdForTier(meta.tier);
    if (!envPriceId || priceIndex.has(envPriceId)) continue;
    priceIndex.set(envPriceId, {
      slug: meta.tier,
      interval: "month",
      currency: DEFAULT_CURRENCY,
      unitAmount: meta.priceAed * 100,
      isCurrent: false,
    });
  }

  return {
    plans: published,
    all: sorted.filter((p) => p.status !== "archived"),
    bySlug: new Map(sorted.map((p) => [p.slug, p])),
    ladder: published.map((p) => p.slug),
    priceIndex,
    adminSlug:
      sorted.find((p) => p.adminGrant)?.slug ??
      published[published.length - 1]?.slug ??
      "studio",
    source,
    loadedAt: Date.now(),
  };
}

// ── database read ────────────────────────────────────────────────────────────

type PlanRow = {
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
  custom_pricing: Record<string, unknown> | null;
};

type CopyRow = {
  plan_id: string;
  locale: string;
  name: string;
  tagline: string | null;
  highlights: unknown;
  badge: string | null;
};

type PriceRow = {
  id: string;
  plan_id: string;
  interval: string;
  currency: string;
  unit_amount: number;
  compare_at_amount: number | null;
  sale_ends_at: string | null;
  stripe_price_id: string;
  is_current: boolean;
};

function asInterval(value: string): BillingInterval {
  return value === "year" ? "year" : "month";
}

function asHighlights(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function toPrice(row: PriceRow): CatalogPrice | null {
  if (!row.stripe_price_id || !isCurrency(row.currency)) return null;
  if (typeof row.unit_amount !== "number" || !Number.isFinite(row.unit_amount)) return null;
  // A sale that has run out is simply no longer a sale, whether or not the
  // expiry cron has got around to reverting the price. The strikethrough must
  // never outlive the offer.
  const saleLive = !row.sale_ends_at || new Date(row.sale_ends_at).getTime() > Date.now();
  return {
    id: row.id,
    stripePriceId: row.stripe_price_id,
    interval: asInterval(row.interval),
    currency: row.currency,
    unitAmount: row.unit_amount,
    compareAtAmount: saleLive ? row.compare_at_amount ?? null : null,
    saleEndsAt: row.sale_ends_at ?? null,
    isCurrent: row.is_current !== false,
  };
}

async function readCatalog(admin: SupabaseClient): Promise<Catalog | null> {
  const [planRes, copyRes, priceRes] = await Promise.all([
    admin
      .from("plans")
      .select(
        "id, slug, kind, status, sort_order, entitlements, trial_days, default_currency, stripe_product_id, admin_grant, custom_pricing"
      )
      .is("archived_at", null),
    admin.from("plan_copy").select("plan_id, locale, name, tagline, highlights, badge"),
    admin
      .from("plan_prices")
      .select(
        "id, plan_id, interval, currency, unit_amount, compare_at_amount, sale_ends_at, stripe_price_id, is_current"
      )
      .is("archived_at", null),
  ]);

  if (planRes.error) throw new Error(planRes.error.message);
  const planRows = (planRes.data ?? []) as PlanRow[];
  // No plans configured yet is not an error — it means the seed hasn't run, and
  // the fallback is the right answer.
  if (planRows.length === 0) return null;

  const copyRows = (copyRes.data ?? []) as CopyRow[];
  const priceRows = (priceRes.data ?? []) as PriceRow[];

  const copyByPlan = new Map<string, Partial<Record<Locale, PlanCopy>>>();
  for (const row of copyRows) {
    if (!LOCALES.includes(row.locale as Locale)) continue;
    const entry = copyByPlan.get(row.plan_id) ?? {};
    entry[row.locale as Locale] = {
      name: row.name,
      tagline: row.tagline ?? "",
      highlights: asHighlights(row.highlights),
      badge: row.badge ?? null,
    };
    copyByPlan.set(row.plan_id, entry);
  }

  const pricesByPlan = new Map<string, CatalogPrice[]>();
  for (const row of priceRows) {
    const price = toPrice(row);
    if (!price) continue;
    pricesByPlan.set(row.plan_id, [...(pricesByPlan.get(row.plan_id) ?? []), price]);
  }

  const plans: CatalogPlan[] = [];
  const historical: { slug: string; price: CatalogPrice }[] = [];

  for (const row of planRows) {
    // A row whose entitlements don't validate would otherwise poison the whole
    // catalog. Fall back to this slug's hardcoded limits (or free) and keep the
    // plan — losing one plan's limits is recoverable, losing the catalog is not.
    const entitlements =
      coerceEntitlements(row.entitlements) ?? ENTITLEMENTS[row.slug as AiTier] ?? ENTITLEMENTS.free;

    // Copy fallback, most specific first: what the admin wrote for this locale,
    // then what they wrote in the default locale, then this build's own copy.
    //
    // For a plan this build has NEVER heard of there is no built-in wording to
    // fall back to, so anything the admin wrote in their other language is
    // preferred over the title-cased slug. For a built-in plan the order is the
    // other way round: an English reader should get this build's English, not
    // untranslated Arabic the admin happened to fill in first.
    const dictCopy = copyFromDictionary(row.slug);
    const stored = copyByPlan.get(row.id) ?? {};
    const anyStored = hasDictionaryCopy(row.slug)
      ? undefined
      : LOCALES.map((l) => stored[l]).find(Boolean);
    const copy = Object.fromEntries(
      LOCALES.map((locale) => [
        locale,
        stored[locale] ?? stored[DEFAULT_LOCALE] ?? anyStored ?? dictCopy[locale],
      ])
    ) as Record<Locale, PlanCopy>;

    const all = pricesByPlan.get(row.id) ?? [];
    for (const price of all.filter((p) => !p.isCurrent)) {
      historical.push({ slug: row.slug, price });
    }

    plans.push({
      id: row.id,
      slug: row.slug,
      kind: (["free", "fixed", "custom"].includes(row.kind) ? row.kind : "fixed") as PlanKind,
      status: (["draft", "published", "archived"].includes(row.status)
        ? row.status
        : "draft") as PlanStatus,
      sortOrder: row.sort_order ?? 100,
      entitlements,
      trialDays: Math.max(0, row.trial_days ?? 0),
      defaultCurrency: isCurrency(row.default_currency) ? row.default_currency : DEFAULT_CURRENCY,
      stripeProductId: row.stripe_product_id,
      adminGrant: row.admin_grant === true,
      customPricing: row.custom_pricing,
      copy,
      prices: all.filter((p) => p.isCurrent),
    });
  }

  return assemble(plans, historical, "db");
}

// ── cache ────────────────────────────────────────────────────────────────────

let cached: Catalog | null = null;
// Dedupes concurrent loads within one instance so a burst of requests after an
// expiry issues one query, not one per request.
let inFlight: Promise<Catalog> | null = null;

function ttlMs(): number {
  return numEnv("BILLING_CATALOG_TTL_MS", 60_000);
}

export function invalidateCatalog(): void {
  cached = null;
  inFlight = null;
}

export async function loadCatalog(opts: { force?: boolean } = {}): Promise<Catalog> {
  if (!opts.force && cached && Date.now() - cached.loadedAt < ttlMs()) return cached;
  if (!opts.force && inFlight) return inFlight;

  const load = (async (): Promise<Catalog> => {
    try {
      const fromDb = await readCatalog(createAdminClient());
      return fromDb ?? fallbackCatalog();
    } catch (err) {
      // Missing table, unapplied migration, missing service-role key, DB blip —
      // all mean the same thing to a caller: use the constants we shipped with.
      console.warn(
        "[billing/catalog] falling back to built-in plans:",
        err instanceof Error ? err.message : err
      );
      return fallbackCatalog();
    }
  })();

  inFlight = load;
  try {
    cached = await load;
    return cached;
  } finally {
    if (inFlight === load) inFlight = null;
  }
}

// ── lookups ──────────────────────────────────────────────────────────────────

export function planBySlug(catalog: Catalog, slug: string): CatalogPlan | null {
  return catalog.bySlug.get(slug) ?? null;
}

// The entitlements a slug grants. Unknown slugs fall back to the hardcoded table
// and finally to free — the same fail-open posture entitlementsFor() has always
// had, so an unrecognised tier can't crash an enforcement chokepoint.
export function entitlementsForSlug(catalog: Catalog, slug: string): Entitlements {
  return catalog.bySlug.get(slug)?.entitlements ?? ENTITLEMENTS[slug as AiTier] ?? ENTITLEMENTS.free;
}

// The build-your-own rate card, as the admin has it — falling back to what this
// build shipped with. Kept here rather than read ad hoc so the client preview
// and the authoritative server repricing can't diverge.
export function customRatesFrom(catalog: Catalog): CustomRates {
  const plan = catalog.plans.find((p) => p.kind === "custom") ?? catalog.bySlug.get("custom");
  return coerceCustomRates(plan?.customPricing);
}

export function planCopyFor(catalog: Catalog, slug: string, locale: Locale): PlanCopy {
  const plan = catalog.bySlug.get(slug);
  if (plan) return plan.copy[locale];
  return copyFromDictionary(slug)[locale];
}

// The English display name, for emails and admin surfaces (both English-only).
export function planName(catalog: Catalog, slug: string): string {
  return planCopyFor(catalog, slug, "en").name;
}

// Same, for the many async server paths that need one name and nothing else.
// Loading the catalog is a cached, usually-free call, so this stays cheap.
export async function planDisplayName(slug: string): Promise<string> {
  return planName(await loadCatalog(), slug);
}

export function currentPrice(
  catalog: Catalog,
  slug: string,
  opts: { interval?: BillingInterval; currency?: Currency } = {}
): CatalogPrice | null {
  const plan = catalog.bySlug.get(slug);
  if (!plan) return null;
  const interval = opts.interval ?? "month";
  const currency = opts.currency ?? plan.defaultCurrency;
  return (
    plan.prices.find((p) => p.interval === interval && p.currency === currency) ??
    // A plan priced only in its default currency shouldn't read as unavailable
    // while multi-currency is still being rolled out.
    plan.prices.find((p) => p.interval === interval && p.currency === plan.defaultCurrency) ??
    null
  );
}

// May a customer buy this plan right now? The write-path counterpart to
// isAiTier's shape check, and deliberately fail-CLOSED: a draft plan, an
// archived one, the free tier, or a slug nobody has ever created are all "no".
//
// A paid plan needs a price to be sellable — except the build-your-own one,
// which prices each configuration ad hoc and so has no plan_prices row.
export function isSellablePlan(catalog: Catalog, slug: string): boolean {
  const plan = catalog.bySlug.get(slug);
  if (!plan || plan.status !== "published" || plan.kind === "free") return false;
  return plan.kind === "custom" || plan.prices.length > 0 || Boolean(stripePriceIdForTier(slug));
}

// Which plan does this Stripe Price sell? Resolves ARCHIVED prices too, which is
// what keeps a grandfathered subscriber on the right plan.
export function slugForStripePrice(catalog: Catalog, priceId: string): string | null {
  return catalog.priceIndex.get(priceId)?.slug ?? null;
}

// A PriceTierResolver (lib/billing/plans.ts) bound to this catalog, for the sync
// and schedule readers.
export function resolverFor(catalog: Catalog): (priceId: string) => AiTier | null {
  return (priceId: string) => (slugForStripePrice(catalog, priceId) as AiTier | null) ?? null;
}
