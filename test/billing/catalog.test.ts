import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";

// The catalog decides what plans exist, what they grant and which Stripe Price
// sells them. Three properties are load-bearing and covered here:
//   1. it fails OPEN to the built-in constants, so billing never hard-breaks;
//   2. archived prices still resolve, so a grandfathered subscriber keeps their
//      plan when the webhook next syncs them;
//   3. it caches, and an admin write can force a reload.

const supabaseState: {
  plans: unknown[];
  copy: unknown[];
  prices: unknown[];
  throwOnPlans?: boolean;
  queries: number;
} = { plans: [], copy: [], prices: [], queries: 0 };

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(table: string) {
      const rows =
        table === "plans"
          ? supabaseState.plans
          : table === "plan_copy"
            ? supabaseState.copy
            : supabaseState.prices;
      const builder = {
        select: () => builder,
        is: () => builder,
        then: (resolve: (v: { data: unknown[]; error: unknown }) => void) => {
          if (table === "plans") {
            supabaseState.queries += 1;
            if (supabaseState.throwOnPlans) {
              return resolve({ data: null as never, error: { message: 'relation "plans" does not exist' } });
            }
          }
          return resolve({ data: rows, error: null });
        },
      };
      return builder;
    },
  }),
}));

const { loadCatalog, invalidateCatalog, fallbackCatalog, slugForStripePrice, currentPrice, entitlementsForSlug, planCopyFor } =
  await import("@/lib/billing/catalog");

const ENT = {
  accounts: 30,
  scripts_mo: 60,
  transcripts_mo: 30,
  automations: 15,
  publish_targets: 1,
  ig_connections: 1,
  model: "sonnet",
};

function planRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "plan-pro",
    slug: "pro",
    kind: "fixed",
    status: "published",
    sort_order: 30,
    entitlements: ENT,
    trial_days: 0,
    default_currency: "aed",
    stripe_product_id: "prod_pro",
    admin_grant: false,
    custom_pricing: null,
    ...overrides,
  };
}

function priceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "price-row-1",
    plan_id: "plan-pro",
    interval: "month",
    currency: "aed",
    unit_amount: 14900,
    compare_at_amount: null,
    sale_ends_at: null,
    stripe_price_id: "price_pro_v1",
    is_current: true,
    ...overrides,
  };
}

beforeEach(() => {
  supabaseState.plans = [];
  supabaseState.copy = [];
  supabaseState.prices = [];
  supabaseState.throwOnPlans = false;
  supabaseState.queries = 0;
  invalidateCatalog();
});

afterEach(() => {
  vi.unstubAllEnvs();
  invalidateCatalog();
});

describe("failing open", () => {
  it("falls back to the built-in plans when the table doesn't exist", async () => {
    supabaseState.throwOnPlans = true;
    const catalog = await loadCatalog();
    expect(catalog.source).toBe("fallback");
    expect(catalog.ladder).toContain("creator");
  });

  it("falls back when the catalog has no plans yet (seed hasn't run)", async () => {
    const catalog = await loadCatalog();
    expect(catalog.source).toBe("fallback");
    expect(catalog.bySlug.get("studio")).toBeTruthy();
  });

  // One bad row must not cost us the whole catalog — the plan survives with the
  // limits this build ships for that slug.
  it("keeps a plan whose entitlements jsonb is malformed", async () => {
    supabaseState.plans = [planRow({ entitlements: { accounts: "lots" } })];
    const catalog = await loadCatalog();
    expect(catalog.source).toBe("db");
    expect(entitlementsForSlug(catalog, "pro").accounts).toBe(50); // built-in Pro
  });

  it("resolves an unknown slug to free-tier entitlements rather than throwing", async () => {
    supabaseState.plans = [planRow()];
    const catalog = await loadCatalog();
    expect(entitlementsForSlug(catalog, "never-heard-of-it").accounts).toBe(3);
  });
});

describe("price resolution", () => {
  // THE property that makes grandfathering safe. A subscriber left on an older
  // price must still resolve to their plan, or the webhook mis-assigns their
  // tier the next time Stripe syncs them.
  it("resolves ARCHIVED prices, not just current ones", async () => {
    supabaseState.plans = [planRow()];
    supabaseState.prices = [
      priceRow({ id: "old", stripe_price_id: "price_pro_v1", unit_amount: 14900, is_current: false }),
      priceRow({ id: "new", stripe_price_id: "price_pro_v2", unit_amount: 17900, is_current: true }),
    ];
    const catalog = await loadCatalog();

    expect(slugForStripePrice(catalog, "price_pro_v1")).toBe("pro");
    expect(slugForStripePrice(catalog, "price_pro_v2")).toBe("pro");
    // Only the current one is what a NEW subscriber is offered.
    expect(currentPrice(catalog, "pro")?.stripePriceId).toBe("price_pro_v2");
  });

  it("still resolves the env price ids, so a half-migrated deploy holds together", async () => {
    vi.stubEnv("STRIPE_PRICE_STUDIO", "price_studio_from_env");
    supabaseState.plans = [planRow()];
    supabaseState.prices = [priceRow()];
    const catalog = await loadCatalog();
    expect(slugForStripePrice(catalog, "price_studio_from_env")).toBe("studio");
  });

  it("drops the strikethrough once a sale has ended", async () => {
    supabaseState.plans = [planRow()];
    supabaseState.prices = [
      priceRow({
        unit_amount: 9900,
        compare_at_amount: 14900,
        sale_ends_at: new Date(Date.now() - 60_000).toISOString(),
      }),
    ];
    const catalog = await loadCatalog();
    expect(currentPrice(catalog, "pro")?.compareAtAmount).toBeNull();
  });

  it("keeps the strikethrough while the sale is live", async () => {
    supabaseState.plans = [planRow()];
    supabaseState.prices = [
      priceRow({
        unit_amount: 9900,
        compare_at_amount: 14900,
        sale_ends_at: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    ];
    const catalog = await loadCatalog();
    expect(currentPrice(catalog, "pro")?.compareAtAmount).toBe(14900);
  });
});

describe("shape", () => {
  it("publishes only published plans but keeps drafts addressable by slug", async () => {
    supabaseState.plans = [
      planRow(),
      planRow({ id: "plan-draft", slug: "agency", status: "draft", sort_order: 40 }),
    ];
    const catalog = await loadCatalog();

    expect(catalog.ladder).toEqual(["pro"]);
    expect(catalog.plans.map((p) => p.slug)).toEqual(["pro"]);
    // A draft is still readable — that's what the admin editor and the
    // "preview as customer" link need.
    expect(catalog.bySlug.get("agency")?.status).toBe("draft");
  });

  it("orders the ladder by sort_order, not by insertion", async () => {
    supabaseState.plans = [
      planRow({ id: "c", slug: "studio", sort_order: 40 }),
      planRow({ id: "a", slug: "creator", sort_order: 20 }),
      planRow({ id: "b", slug: "pro", sort_order: 30 }),
    ];
    const catalog = await loadCatalog();
    expect(catalog.ladder).toEqual(["creator", "pro", "studio"]);
  });

  it("takes the admin-grant plan from the catalog, so renaming Studio is safe", async () => {
    supabaseState.plans = [
      planRow(),
      planRow({ id: "plan-agency", slug: "agency", sort_order: 40, admin_grant: true }),
    ];
    const catalog = await loadCatalog();
    expect(catalog.adminSlug).toBe("agency");
  });

  it("uses the admin's own copy per locale, falling back to the built-in wording", async () => {
    supabaseState.plans = [planRow()];
    supabaseState.copy = [
      { plan_id: "plan-pro", locale: "ar", name: "برو", tagline: "للمحترفين", highlights: ["حد أعلى"], badge: null },
    ];
    const catalog = await loadCatalog();

    expect(planCopyFor(catalog, "pro", "ar").name).toBe("برو");
    expect(planCopyFor(catalog, "pro", "ar").highlights).toEqual(["حد أعلى"]);
    // Only Arabic was stored, and "pro" is a built-in — so an English reader
    // gets this build's English wording rather than untranslated Arabic.
    expect(planCopyFor(catalog, "pro", "en").name).toBe("Pro");
  });

  // For a plan the dictionaries have never heard of there is no built-in copy to
  // fall back to, so the admin's own wording in their other language is the best
  // answer available — better than rendering a raw slug at a customer.
  it("falls back to the admin's other language for a plan they created", async () => {
    supabaseState.plans = [planRow({ id: "plan-agency", slug: "agency" })];
    supabaseState.copy = [
      { plan_id: "plan-agency", locale: "ar", name: "وكالة", tagline: "", highlights: [], badge: null },
    ];
    const catalog = await loadCatalog();
    expect(planCopyFor(catalog, "agency", "en").name).toBe("وكالة");
  });
});

describe("caching", () => {
  it("serves repeat reads from cache and reloads when invalidated", async () => {
    supabaseState.plans = [planRow()];

    await loadCatalog();
    await loadCatalog();
    expect(supabaseState.queries).toBe(1);

    invalidateCatalog();
    await loadCatalog();
    expect(supabaseState.queries).toBe(2);
  });

  it("re-reads immediately when forced, so an admin sees their own write", async () => {
    supabaseState.plans = [planRow()];
    await loadCatalog();
    supabaseState.plans = [planRow({ slug: "pro", sort_order: 30 }), planRow({ id: "x", slug: "agency" })];

    const forced = await loadCatalog({ force: true });
    expect(forced.bySlug.has("agency")).toBe(true);
  });
});

describe("fallbackCatalog", () => {
  it("is pure and needs no database at all", () => {
    const catalog = fallbackCatalog();
    expect(catalog.source).toBe("fallback");
    expect(catalog.ladder).toEqual(["free", "creator", "pro", "studio", "custom"]);
    // Admins have always resolved to the top of the ladder.
    expect(catalog.adminSlug).toBe("studio");
  });
});
