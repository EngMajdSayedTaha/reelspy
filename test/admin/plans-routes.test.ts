import { describe, it, expect, vi, beforeEach } from "vitest";

// The plan catalog is editable at runtime, which means the guardrails ARE the
// feature: a catalog you can edit freely is one you can silently break paying
// customers with. These pin the rules that protect them.

let ctx: {
  user: { id: string };
  supabase: unknown;
  admin: unknown;
  ip: string | null;
  userAgent: string | null;
};

vi.mock("@/lib/admin/auth", async () => {
  const { NextResponse } = await import("next/server");
  return {
    requireAdmin: async () => ({ ok: true, ctx }),
    adminNotFound: () => NextResponse.json({ error: "Not found" }, { status: 404 }),
  };
});

const auditSpy = vi.fn();
vi.mock("@/lib/admin/audit", () => ({ writeAudit: (...args: unknown[]) => auditSpy(...args) }));

const invalidateSpy = vi.fn();
vi.mock("@/lib/billing/catalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/billing/catalog")>()),
  invalidateCatalog: () => invalidateSpy(),
}));

const { PATCH: planPatch } = await import("@/app/api/admin/plans/[id]/route");
const { loweredEntitlements, canArchive, canPublish } = await import("@/lib/admin/plans");

const ADMIN_ID = "admin-1";
const PLAN_ID = "plan-pro";

const ENT = {
  accounts: 50,
  scripts_mo: 200,
  transcripts_mo: 100,
  automations: 30,
  publish_targets: 4,
  ig_connections: 1,
  model: "opus" as const,
};

// A service-role stand-in that serves the three catalog tables plus the
// subscriptions read the guardrails are decided on, and records every write.
function fakeAdmin(opts: {
  plan?: Record<string, unknown>;
  subscriptions?: { tier: string; status: string; stripe_price_id: string | null }[];
  prices?: Record<string, unknown>[];
}) {
  const writes: { table: string; payload: unknown }[] = [];
  const plan = opts.plan ?? {
    id: PLAN_ID,
    slug: "pro",
    kind: "fixed",
    status: "published",
    sort_order: 30,
    entitlements: ENT,
    trial_days: 0,
    default_currency: "aed",
    stripe_product_id: null,
    admin_grant: false,
  };

  const rowsFor = (table: string): unknown[] => {
    if (table === "plans") return [plan];
    if (table === "plan_copy")
      return [
        { plan_id: PLAN_ID, locale: "en", name: "Pro", tagline: "", highlights: [], badge: null },
        { plan_id: PLAN_ID, locale: "ar", name: "برو", tagline: "", highlights: [], badge: null },
      ];
    if (table === "plan_prices")
      return (
        opts.prices ?? [
          {
            id: "price-1",
            plan_id: PLAN_ID,
            interval: "month",
            currency: "aed",
            unit_amount: 14900,
            compare_at_amount: null,
            sale_ends_at: null,
            stripe_price_id: "price_pro_v1",
            is_current: true,
            created_at: "2026-01-01T00:00:00Z",
          },
        ]
      );
    if (table === "subscriptions") return opts.subscriptions ?? [];
    return [];
  };

  const admin = {
    from(table: string) {
      const builder: Record<string, unknown> = {};
      Object.assign(builder, {
        select: () => builder,
        eq: () => builder,
        is: () => builder,
        order: () => builder,
        maybeSingle: async () => ({ data: null, error: null }),
        update: (payload: unknown) => {
          writes.push({ table, payload });
          return builder;
        },
        upsert: (payload: unknown) => {
          writes.push({ table, payload });
          return { then: (r: (v: { error: null }) => void) => r({ error: null }) };
        },
        insert: (payload: unknown) => {
          writes.push({ table, payload });
          return builder;
        },
        then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
          resolve({ data: rowsFor(table), error: null }),
      });
      return builder;
    },
  };

  return { admin, writes };
}

function makeCtx(admin: unknown) {
  return {
    user: { id: ADMIN_ID },
    supabase: { rpc: async () => ({ data: [{ allowed: true }], error: null }) },
    admin,
    ip: null,
    userAgent: null,
  };
}

function patch(body: unknown): Request {
  return new Request("https://x", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ id: PLAN_ID }) };

beforeEach(() => {
  auditSpy.mockClear();
  invalidateSpy.mockClear();
});

describe("slug immutability", () => {
  // The slug is stored verbatim in subscriptions.tier, so renaming it after
  // anyone has subscribed orphans their row.
  it("refuses to rename a slug any subscription references", async () => {
    const { admin } = fakeAdmin({
      subscriptions: [{ tier: "pro", status: "canceled", stripe_price_id: null }],
    });
    ctx = makeCtx(admin);

    const res = await planPatch(patch({ slug: "professional" }), params);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("slug is fixed") });
  });

  it("allows renaming a slug nobody has ever been on", async () => {
    const { admin, writes } = fakeAdmin({ subscriptions: [] });
    ctx = makeCtx(admin);

    const res = await planPatch(patch({ slug: "professional" }), params);
    expect(res.status).toBe(200);
    expect(writes.some((w) => w.table === "plans")).toBe(true);
  });
});

describe("entitlement reductions", () => {
  // Prices are grandfathered; limits are not. A reduction reaches existing
  // subscribers immediately, so it must never happen by accident.
  it("refuses a reduction with subscribers until it is acknowledged", async () => {
    const { admin } = fakeAdmin({
      subscriptions: [{ tier: "pro", status: "active", stripe_price_id: "price_pro_v1" }],
    });
    ctx = makeCtx(admin);

    const res = await planPatch(patch({ entitlements: { ...ENT, accounts: 10 } }), params);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      needsConfirmation: true,
      lowered: ["accounts"],
      subscribers: 1,
    });
  });

  it("applies the reduction once acknowledged, and audits what it cost", async () => {
    const { admin } = fakeAdmin({
      subscriptions: [{ tier: "pro", status: "active", stripe_price_id: "price_pro_v1" }],
    });
    ctx = makeCtx(admin);

    const res = await planPatch(
      patch({ entitlements: { ...ENT, accounts: 10 }, confirmLoweredLimits: true }),
      params
    );
    expect(res.status).toBe(200);
    expect(auditSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "plan.update",
        payload: expect.objectContaining({ loweredLimits: ["accounts"], affectedSubscribers: 1 }),
      })
    );
  });

  it("waves through an increase without confirmation", async () => {
    const { admin } = fakeAdmin({
      subscriptions: [{ tier: "pro", status: "active", stripe_price_id: "price_pro_v1" }],
    });
    ctx = makeCtx(admin);

    const res = await planPatch(patch({ entitlements: { ...ENT, accounts: 500 } }), params);
    expect(res.status).toBe(200);
  });
});

describe("archiving", () => {
  it("refuses to archive the plan admins resolve to", async () => {
    const { admin } = fakeAdmin({
      plan: {
        id: PLAN_ID,
        slug: "studio",
        kind: "fixed",
        status: "published",
        sort_order: 40,
        entitlements: ENT,
        trial_days: 0,
        default_currency: "aed",
        stripe_product_id: null,
        admin_grant: true,
      },
    });
    ctx = makeCtx(admin);

    const res = await planPatch(patch({ status: "archived" }), params);
    expect(res.status).toBe(409);
  });

  // Retiring a plan that still has subscribers is the NORMAL end state: hidden
  // to new buyers, still served to the people paying for it.
  it("allows archiving a plan that still has subscribers", async () => {
    const { admin } = fakeAdmin({
      subscriptions: [{ tier: "pro", status: "active", stripe_price_id: "price_pro_v1" }],
    });
    ctx = makeCtx(admin);

    const res = await planPatch(patch({ status: "archived" }), params);
    expect(res.status).toBe(200);
    expect(auditSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "plan.archive" })
    );
  });
});

describe("publishing", () => {
  it("refuses to publish a paid plan with no price", async () => {
    const { admin } = fakeAdmin({
      plan: {
        id: PLAN_ID,
        slug: "agency",
        kind: "fixed",
        status: "draft",
        sort_order: 50,
        entitlements: ENT,
        trial_days: 0,
        default_currency: "aed",
        stripe_product_id: null,
        admin_grant: false,
      },
      prices: [],
    });
    ctx = makeCtx(admin);

    const res = await planPatch(patch({ status: "published" }), params);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("price in AED") });
  });

  it("invalidates the catalog cache so the change is live immediately", async () => {
    const { admin } = fakeAdmin({});
    ctx = makeCtx(admin);

    await planPatch(patch({ sortOrder: 35 }), params);
    expect(invalidateSpy).toHaveBeenCalled();
  });
});

// The pure rules, exercised directly — cheaper to cover the edges here than
// through a route.
describe("guardrail helpers", () => {
  it("treats moving away from unlimited as a reduction, and towards it as not", () => {
    const unlimited = { ...ENT, scripts_mo: -1 };
    expect(loweredEntitlements(unlimited, { ...ENT, scripts_mo: 200 })).toContain("scripts_mo");
    expect(loweredEntitlements({ ...ENT, scripts_mo: 200 }, unlimited)).not.toContain("scripts_mo");
  });

  it("reports nothing lowered when there was no previous entitlement set", () => {
    expect(loweredEntitlements(null, ENT)).toEqual([]);
  });

  const basePlan = {
    id: PLAN_ID,
    slug: "pro",
    kind: "fixed",
    status: "draft",
    sortOrder: 30,
    entitlements: ENT,
    trialDays: 0,
    defaultCurrency: "aed",
    stripeProductId: null,
    adminGrant: false,
    copy: {
      en: { name: "Pro", tagline: "", highlights: [], badge: null },
      ar: { name: "برو", tagline: "", highlights: [], badge: null },
    },
    prices: [],
    subscribers: 0,
    slugLocked: false,
  };

  it("never lets the free plan be archived — it's the fallback for everyone", () => {
    expect(canArchive({ ...basePlan, kind: "free" }).ok).toBe(false);
  });

  it("requires an English name before a plan can go live", () => {
    const noName = { ...basePlan, copy: { ...basePlan.copy, en: { ...basePlan.copy.en, name: "  " } } };
    expect(canPublish(noName).ok).toBe(false);
  });

  // The build-your-own plan prices each configuration ad hoc, so it has no
  // plan_prices row and must not be held to the "needs a price" rule.
  it("lets the custom plan publish without a price row", () => {
    expect(canPublish({ ...basePlan, kind: "custom" }).ok).toBe(true);
  });
});
