import { describe, it, expect, afterEach, vi } from "vitest";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { syncSubscription, grantsAccess, tierOfSubscription } from "@/lib/billing/sync";

// syncSubscription is the only writer of the subscriptions row, so these cover
// the two things that must never go wrong: the tier it writes, and the fact that
// a database missing the scheduled-plan-change migration still gets that write.

const PERIOD_END = 1_700_000_000;

afterEach(() => {
  vi.unstubAllEnvs();
});

function subscription(overrides: Record<string, unknown> = {}): Stripe.Subscription {
  return {
    id: "sub_1",
    customer: "cus_1",
    status: "active",
    schedule: null,
    cancel_at_period_end: false,
    current_period_end: PERIOD_END,
    items: { data: [{ price: { id: "price_pro" } }] },
    metadata: { user_id: "user-1" },
    ...overrides,
  } as unknown as Stripe.Subscription;
}

type UpsertOutcome = { error: { code?: string; message: string } | null };

function fakeAdmin(opts: {
  previous?: Record<string, unknown> | null;
  onUpsert?: (payload: Record<string, unknown>) => UpsertOutcome;
}) {
  const writes: Record<string, unknown>[] = [];
  const builder: Record<string, unknown> = {};
  Object.assign(builder, {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => ({ data: opts.previous ?? null, error: null }),
    upsert: (payload: Record<string, unknown>) => {
      writes.push(payload);
      const outcome = opts.onUpsert?.(payload) ?? { error: null };
      return { then: (resolve: (v: UpsertOutcome) => void) => resolve(outcome) };
    },
  });
  const admin = { from: () => builder } as unknown as SupabaseClient;
  return { admin, writes };
}

// A subscription with no schedule never reaches the network, so a bare object
// is enough to exercise the "refresh the pending cache" branch.
const noopStripe = {} as Stripe;

describe("syncSubscription", () => {
  it("writes the tier the price sells and clears the pending cache", async () => {
    vi.stubEnv("STRIPE_PRICE_PRO", "price_pro");
    const { admin, writes } = fakeAdmin({});

    const result = await syncSubscription(admin, subscription(), noopStripe);

    expect(result).toMatchObject({ userId: "user-1", tier: "pro", status: "active" });
    expect(writes[0]).toMatchObject({
      user_id: "user-1",
      tier: "pro",
      status: "active",
      cancel_at_period_end: false,
      current_period_end: new Date(PERIOD_END * 1000).toISOString(),
      pending_tier: null,
      stripe_schedule_id: null,
    });
  });

  it("returns the pre-write state so callers can diff for notifications", async () => {
    vi.stubEnv("STRIPE_PRICE_PRO", "price_pro");
    const { admin } = fakeAdmin({
      previous: { tier: "creator", status: "active", cancel_at_period_end: true },
    });

    const result = await syncSubscription(admin, subscription(), noopStripe);

    expect(result?.previous).toEqual({ tier: "creator", status: "active", cancelAtPeriodEnd: true });
  });

  it("drops an inactive subscription to free and leaves nothing pending", async () => {
    vi.stubEnv("STRIPE_PRICE_PRO", "price_pro");
    const { admin, writes } = fakeAdmin({});

    const result = await syncSubscription(admin, subscription({ status: "canceled" }), noopStripe);

    expect(result?.tier).toBe("free");
    expect(writes[0]).toMatchObject({ tier: "free", pending_tier: null });
  });

  // The scheduled-change columns are a cache; the tier is not. If the migration
  // hasn't been applied, we must still write the tier rather than 500 the webhook.
  it("retries without the scheduled-change columns when the database lacks them", async () => {
    vi.stubEnv("STRIPE_PRICE_PRO", "price_pro");
    const { admin, writes } = fakeAdmin({
      onUpsert: (payload) =>
        "pending_tier" in payload
          ? { error: { code: "42703", message: 'column "pending_tier" does not exist' } }
          : { error: null },
    });

    const result = await syncSubscription(admin, subscription(), noopStripe);

    expect(result?.tier).toBe("pro");
    expect(writes).toHaveLength(2);
    expect(writes[1]).toMatchObject({ tier: "pro", status: "active" });
    expect(writes[1]).not.toHaveProperty("pending_tier");
  });

  it("still throws on a real write failure so Stripe retries the event", async () => {
    vi.stubEnv("STRIPE_PRICE_PRO", "price_pro");
    const { admin } = fakeAdmin({
      onUpsert: () => ({ error: { code: "23505", message: "duplicate key" } }),
    });

    await expect(syncSubscription(admin, subscription(), noopStripe)).rejects.toThrow("duplicate key");
  });

  it("skips the write when no user can be resolved", async () => {
    const { admin, writes } = fakeAdmin({});
    const orphan = subscription({ metadata: {}, customer: null });
    expect(await syncSubscription(admin, orphan, noopStripe)).toBeNull();
    expect(writes).toHaveLength(0);
  });
});

describe("tier + access derivation", () => {
  it("grants access only for the paying statuses", () => {
    expect(["active", "trialing", "past_due"].every(grantsAccess)).toBe(true);
    expect(["canceled", "unpaid", "incomplete", "paused"].some(grantsAccess)).toBe(false);
  });

  it("prefers the priced plan, then metadata, then free", () => {
    vi.stubEnv("STRIPE_PRICE_STUDIO", "price_studio");
    expect(tierOfSubscription(subscription({ items: { data: [{ price: { id: "price_studio" } }] } }))).toBe(
      "studio"
    );
    expect(
      tierOfSubscription(
        subscription({
          items: { data: [{ price: { id: "price_adhoc" } }] },
          metadata: { tier: "custom" },
        })
      )
    ).toBe("custom");
    expect(tierOfSubscription(subscription({ items: { data: [] }, metadata: {} }))).toBe("free");
  });
});
