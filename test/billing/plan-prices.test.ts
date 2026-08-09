import { describe, it, expect } from "vitest";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mintPlanPrice, validatePriceInput, MIN_UNIT_AMOUNT_MINOR } from "@/lib/billing/plan-prices";

// The promise a price edit makes is that NOBODY already subscribed is repriced.
// That rests on three things, all covered here: a new Stripe Price is created
// rather than an existing one edited; the previous row is demoted but KEPT (so
// the catalog can still resolve it); and the previous Stripe Price is never
// deactivated (deactivating it would break scheduled plan changes for everyone
// still on it).

type Row = Record<string, unknown>;

function fakeAdmin(previous: Row | null) {
  const writes: { table: string; op: string; payload: Row }[] = [];
  const admin = {
    from(table: string) {
      const builder: Record<string, unknown> = {};
      Object.assign(builder, {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({
          data: table === "plan_prices" ? previous : { id: "inserted-1" },
          error: null,
        }),
        update: (payload: Row) => {
          writes.push({ table, op: "update", payload });
          return builder;
        },
        insert: (payload: Row) => {
          writes.push({ table, op: "insert", payload });
          return {
            select: () => ({
              maybeSingle: async () => ({ data: { id: "inserted-1" }, error: null }),
            }),
          };
        },
      });
      return builder;
    },
  } as unknown as SupabaseClient;
  return { admin, writes };
}

function fakeStripe() {
  const created: Record<string, unknown>[] = [];
  const updated: Record<string, unknown>[] = [];
  const stripe = {
    products: {
      retrieve: async (id: string) => ({ id, deleted: false }),
      create: async (params: Record<string, unknown>) => ({ id: "prod_new", ...params }),
    },
    prices: {
      create: async (params: Record<string, unknown>) => {
        created.push(params);
        return { id: `price_new_${created.length}` };
      },
      update: async (id: string, params: Record<string, unknown>) => {
        updated.push({ id, ...params });
        return { id };
      },
    },
  } as unknown as Stripe;
  return { stripe, created, updated };
}

const INPUT = {
  planId: "plan-1",
  slug: "pro",
  stripeProductId: "prod_pro",
  planName: "Pro",
  interval: "month" as const,
  currency: "aed" as const,
  unitAmount: 17900,
};

describe("mintPlanPrice", () => {
  it("creates a NEW Stripe Price rather than editing the old one", async () => {
    const { admin } = fakeAdmin({ id: "old-row", stripe_price_id: "price_old", unit_amount: 14900 });
    const { stripe, created, updated } = fakeStripe();

    const result = await mintPlanPrice(admin, stripe, INPUT);

    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      product: "prod_pro",
      currency: "aed",
      unit_amount: 17900,
      recurring: { interval: "month" },
    });
    expect(result.stripePriceId).toBe("price_new_1");
    // Never touch the old Price: deactivating it doesn't affect existing
    // subscriptions but DOES stop Subscription Schedules using it, which would
    // leave every grandfathered subscriber unable to change plan.
    expect(updated).toHaveLength(0);
  });

  it("demotes the previous row but keeps it un-archived, so it still resolves", async () => {
    const { admin, writes } = fakeAdmin({ id: "old-row", stripe_price_id: "price_old", unit_amount: 14900 });
    const { stripe } = fakeStripe();

    await mintPlanPrice(admin, stripe, INPUT);

    const demote = writes.find((w) => w.table === "plan_prices" && w.op === "update");
    expect(demote?.payload).toEqual({ is_current: false });
    // archived_at is deliberately untouched — the price is retired from sale,
    // not dead; subscribers are still billing on it.
    expect(demote?.payload).not.toHaveProperty("archived_at");
  });

  it("reports what it replaced, so the caller can offer to migrate those subscribers", async () => {
    const { admin } = fakeAdmin({ id: "old-row", stripe_price_id: "price_old", unit_amount: 14900 });
    const { stripe } = fakeStripe();

    const result = await mintPlanPrice(admin, stripe, INPUT);

    expect(result.replaced).toEqual({ id: "old-row", stripePriceId: "price_old", unitAmount: 14900 });
  });

  it("has nothing to replace for a plan's first price", async () => {
    const { admin, writes } = fakeAdmin(null);
    const { stripe } = fakeStripe();

    const result = await mintPlanPrice(admin, stripe, INPUT);

    expect(result.replaced).toBeNull();
    expect(writes.some((w) => w.op === "update" && w.table === "plan_prices")).toBe(false);
  });

  it("creates a Stripe Product when the plan has none, and records it", async () => {
    const { admin, writes } = fakeAdmin(null);
    const { stripe } = fakeStripe();

    const result = await mintPlanPrice(admin, stripe, { ...INPUT, stripeProductId: null });

    expect(result.stripeProductId).toBe("prod_new");
    expect(writes).toContainEqual(
      expect.objectContaining({ table: "plans", payload: { stripe_product_id: "prod_new" } })
    );
  });

  it("restores the previous price when the insert fails, so the plan is never left unbuyable", async () => {
    const previous = { id: "old-row", stripe_price_id: "price_old", unit_amount: 14900 };
    const writes: { table: string; op: string; payload: Row }[] = [];
    const admin = {
      from(table: string) {
        const builder: Record<string, unknown> = {};
        Object.assign(builder, {
          select: () => builder,
          eq: () => builder,
          maybeSingle: async () => ({ data: previous, error: null }),
          update: (payload: Row) => {
            writes.push({ table, op: "update", payload });
            return builder;
          },
          insert: () => ({
            select: () => ({
              maybeSingle: async () => ({ data: null, error: { message: "constraint violated" } }),
            }),
          }),
        });
        return builder;
      },
    } as unknown as SupabaseClient;
    const { stripe } = fakeStripe();

    await expect(mintPlanPrice(admin, stripe, INPUT)).rejects.toThrow("constraint violated");

    const updates = writes.filter((w) => w.table === "plan_prices" && w.op === "update");
    expect(updates.at(-1)?.payload).toEqual({ is_current: true });
  });
});

describe("validatePriceInput", () => {
  // The classic mistake: typing major units into a minor-unit field, which
  // charges AED 1.49 instead of AED 149. The floor has to sit ABOVE the typo
  // range to catch it — a 1.00 floor would wave 149 straight through.
  it("rejects an amount that looks like major units typed by mistake", () => {
    for (const typo of [49, 149, 349]) {
      expect(validatePriceInput({ unitAmount: typo }).ok).toBe(false);
    }
    expect(MIN_UNIT_AMOUNT_MINOR).toBeGreaterThan(349);
  });

  it("rejects zero and negative prices", () => {
    expect(validatePriceInput({ unitAmount: 0 }).ok).toBe(false);
    expect(validatePriceInput({ unitAmount: -14900 }).ok).toBe(false);
  });

  it("rejects a 'was' price that isn't higher than what's charged", () => {
    expect(validatePriceInput({ unitAmount: 14900, compareAtAmount: 14900 }).ok).toBe(false);
    expect(validatePriceInput({ unitAmount: 14900, compareAtAmount: 9900 }).ok).toBe(false);
    expect(validatePriceInput({ unitAmount: 9900, compareAtAmount: 14900 }).ok).toBe(true);
  });

  it("accepts an ordinary price", () => {
    expect(validatePriceInput({ unitAmount: 14900 }).ok).toBe(true);
  });
});
