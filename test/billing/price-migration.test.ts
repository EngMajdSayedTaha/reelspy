import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

// The single most important property of a price migration is that it NEVER
// CHARGES ANYBODY TODAY. Routing it through changePlanForUser would see a higher
// price, decide "upgrade ⇒ immediate", and invoice every subscriber at once —
// the exact opposite of what grandfathering promised them. These pin that, plus
// the notice period and the cancellation escape hatch.

const scheduleCalls: unknown[] = [];
const immediateCalls: unknown[] = [];
const emails: Record<string, unknown>[] = [];
const enqueued: Record<string, unknown>[] = [];

vi.mock("@/lib/billing/schedule", () => ({
  schedulePlanChange: async (...args: unknown[]) => {
    scheduleCalls.push(args);
    return { tier: "pro", effectiveAt: "2026-10-01T00:00:00Z", scheduleId: "sched_1" };
  },
}));

// If this is ever called by the migration path, the test fails loudly.
vi.mock("@/lib/billing/plan-change", () => ({
  changePlanForUser: async (...args: unknown[]) => {
    immediateCalls.push(args);
    return { ok: true, mode: "immediate" };
  },
}));

vi.mock("@/lib/billing/notify", () => ({ emailForUser: async () => "user@example.com" }));
vi.mock("@/lib/email/billing", () => ({
  sendPriceChangeNotice: async (params: Record<string, unknown>) => {
    emails.push(params);
    return true;
  },
}));
vi.mock("@/lib/jobs/queue", () => ({
  enqueueJob: async (_admin: unknown, input: Record<string, unknown>) => {
    enqueued.push(input);
    return { id: "job-1", skipped: false };
  },
}));

const { runPriceMigration, effectiveDateFor, findMigrationTargets } = await import(
  "@/lib/billing/price-migration"
);

const NOW = new Date("2026-08-01T00:00:00Z");

function fakeAdmin(opts: {
  migration?: Record<string, unknown> | null;
  toPrice?: Record<string, unknown> | null;
  subscriptions?: Record<string, unknown>[];
}) {
  const writes: { table: string; payload: unknown }[] = [];
  const admin = {
    from(table: string) {
      const builder: Record<string, unknown> = {};
      Object.assign(builder, {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        limit: () => builder,
        maybeSingle: async () => ({
          data:
            table === "plan_price_migrations"
              ? opts.migration === undefined
                ? { id: "mig-1", plan_id: "plan-1", to_price_id: "price-new", notice_days: 30, status: "running" }
                : opts.migration
              : table === "plan_prices"
                ? opts.toPrice === undefined
                  ? {
                      id: "price-new",
                      stripe_price_id: "price_pro_v2",
                      unit_amount: 17900,
                      currency: "aed",
                      interval: "month",
                      plan_id: "plan-1",
                    }
                  : opts.toPrice
                : null,
          error: null,
        }),
        upsert: (payload: unknown) => {
          writes.push({ table, payload });
          return { then: (r: (v: { error: null }) => void) => r({ error: null }) };
        },
        update: (payload: unknown) => {
          writes.push({ table, payload });
          return builder;
        },
        then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
          resolve({ data: table === "subscriptions" ? (opts.subscriptions ?? []) : [], error: null }),
      });
      return builder;
    },
  } as unknown as SupabaseClient;
  return { admin, writes };
}

function fakeStripe(sub: Partial<Stripe.Subscription> = {}) {
  return {
    subscriptions: {
      retrieve: async () => ({
        id: "sub_1",
        status: "active",
        current_period_end: Math.floor(new Date("2026-10-01T00:00:00Z").getTime() / 1000),
        items: { data: [{ price: { id: "price_pro_v1", unit_amount: 14900, currency: "aed" } }] },
        ...sub,
      }),
    },
  } as unknown as Stripe;
}

beforeEach(() => {
  scheduleCalls.length = 0;
  immediateCalls.length = 0;
  emails.length = 0;
  enqueued.length = 0;
  vi.setSystemTime(NOW);
});

describe("runPriceMigration", () => {
  it("SCHEDULES the change and never applies it immediately", async () => {
    const { admin } = fakeAdmin({});

    const outcome = await runPriceMigration(admin, fakeStripe(), {
      migrationId: "mig-1",
      userId: "user-1",
      subscriptionId: "sub_1",
    });

    expect(outcome).toBe("scheduled");
    expect(scheduleCalls).toHaveLength(1);
    // The load-bearing assertion of this whole feature.
    expect(immediateCalls).toHaveLength(0);
  });

  it("emails the old price, the new price and the date before it happens", async () => {
    const { admin } = fakeAdmin({});

    await runPriceMigration(admin, fakeStripe(), {
      migrationId: "mig-1",
      userId: "user-1",
      subscriptionId: "sub_1",
    });

    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({ to: "user@example.com" });
    expect(emails[0].oldPriceLabel).toContain("149");
    expect(emails[0].newPriceLabel).toContain("179");
    expect(emails[0].effectiveOnLabel).toBeTruthy();
  });

  // Cancelling a migration has to stop the jobs already sitting in the queue.
  it("is a no-op once the migration is cancelled", async () => {
    const { admin } = fakeAdmin({
      migration: { id: "mig-1", plan_id: "plan-1", to_price_id: "price-new", notice_days: 30, status: "cancelled" },
    });

    const outcome = await runPriceMigration(admin, fakeStripe(), {
      migrationId: "mig-1",
      userId: "user-1",
      subscriptionId: "sub_1",
    });

    expect(outcome).toBe("skipped");
    expect(scheduleCalls).toHaveLength(0);
  });

  it("skips a subscription that is no longer active", async () => {
    const { admin } = fakeAdmin({});
    const outcome = await runPriceMigration(admin, fakeStripe({ status: "canceled" }), {
      migrationId: "mig-1",
      userId: "user-1",
      subscriptionId: "sub_1",
    });
    expect(outcome).toBe("skipped");
    expect(scheduleCalls).toHaveLength(0);
  });

  it("skips someone already on the target price", async () => {
    const { admin } = fakeAdmin({});
    const stripe = fakeStripe({
      items: { data: [{ price: { id: "price_pro_v2", unit_amount: 17900, currency: "aed" } }] },
    } as never);

    expect(
      await runPriceMigration(admin, stripe, {
        migrationId: "mig-1",
        userId: "user-1",
        subscriptionId: "sub_1",
      })
    ).toBe("skipped");
  });

  // Nobody's price should change with less warning than they were promised.
  it("re-queues a subscriber whose renewal is inside the notice period", async () => {
    const { admin } = fakeAdmin({});
    const soon = fakeStripe({
      current_period_end: Math.floor(new Date("2026-08-10T00:00:00Z").getTime() / 1000),
    });

    const outcome = await runPriceMigration(admin, soon, {
      migrationId: "mig-1",
      userId: "user-1",
      subscriptionId: "sub_1",
    });

    expect(outcome).toBe("deferred");
    expect(scheduleCalls).toHaveLength(0);
    expect(enqueued).toHaveLength(1);
    expect(enqueued[0]).toMatchObject({ kind: "migrate_plan_price" });
  });
});

describe("effectiveDateFor", () => {
  it("uses the renewal when it is far enough out", () => {
    const { effectiveAt, deferred } = effectiveDateFor("2026-10-01T00:00:00Z", 30, NOW);
    expect(deferred).toBe(false);
    expect(effectiveAt?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("defers when the renewal is sooner than the notice period", () => {
    expect(effectiveDateFor("2026-08-10T00:00:00Z", 30, NOW).deferred).toBe(true);
  });

  it("treats the boundary as enough notice", () => {
    expect(effectiveDateFor("2026-08-31T00:00:00Z", 30, NOW).deferred).toBe(false);
  });

  it("has nothing to compute without a period end", () => {
    expect(effectiveDateFor(null, 30, NOW)).toEqual({ effectiveAt: null, deferred: false });
    expect(effectiveDateFor("not a date", 30, NOW)).toEqual({ effectiveAt: null, deferred: false });
  });
});

describe("findMigrationTargets", () => {
  it("ignores rows with no Stripe subscription to act on", async () => {
    const { admin } = fakeAdmin({
      subscriptions: [
        { user_id: "u1", stripe_subscription_id: "sub_1", current_period_end: null },
        { user_id: "u2", stripe_subscription_id: null, current_period_end: null },
      ],
    });

    const targets = await findMigrationTargets(admin, "price_pro_v1");
    expect(targets.map((t) => t.userId)).toEqual(["u1"]);
  });
});
