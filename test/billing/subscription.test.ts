import { describe, it, expect } from "vitest";
import {
  getSubscription,
  getPendingPlanChange,
  activeTierFromSubscription,
} from "@/lib/billing/subscription";
import { fakeSupabase, throwingSupabase } from "../helpers/fake-supabase";

const USER = "user-1";

function row(overrides: Record<string, unknown> = {}) {
  return {
    tier: "pro",
    status: "active",
    stripe_customer_id: "cus_1",
    stripe_subscription_id: "sub_1",
    current_period_end: "2026-08-01T00:00:00Z",
    cancel_at_period_end: false,
    ...overrides,
  };
}

describe("getSubscription", () => {
  it("maps an active subscription row", async () => {
    const sub = await getSubscription(fakeSupabase({ maybeSingle: { data: row(), error: null } }), USER);
    expect(sub).toMatchObject({ tier: "pro", status: "active", active: true, cancelAtPeriodEnd: false });
    expect(sub?.stripeCustomerId).toBe("cus_1");
  });

  it("treats past_due and trialing as still-active (dunning/trial access)", async () => {
    for (const status of ["past_due", "trialing"]) {
      const sub = await getSubscription(fakeSupabase({ maybeSingle: { data: row({ status }), error: null } }), USER);
      expect(sub?.active).toBe(true);
    }
  });

  it("treats canceled/unpaid as inactive", async () => {
    for (const status of ["canceled", "unpaid", "incomplete_expired"]) {
      const sub = await getSubscription(fakeSupabase({ maybeSingle: { data: row({ status }), error: null } }), USER);
      expect(sub?.active).toBe(false);
    }
  });

  // A slug this build doesn't know is not an error — an admin can create plans,
  // and deployments roll out one at a time. Reading it back as `free` would
  // revoke a paying customer's plan; only a MALFORMED value falls back.
  it("keeps a well-formed tier slug it has never heard of", async () => {
    const sub = await getSubscription(
      fakeSupabase({ maybeSingle: { data: row({ tier: "agency" }), error: null } }),
      USER
    );
    expect(sub?.tier).toBe("agency");
  });

  it("coerces a malformed tier to free", async () => {
    const sub = await getSubscription(
      fakeSupabase({ maybeSingle: { data: row({ tier: "not a slug" }), error: null } }),
      USER
    );
    expect(sub?.tier).toBe("free");
  });

  it("parses a valid custom_entitlements jsonb column for a custom subscriber (B4)", async () => {
    const custom = {
      accounts: 42,
      scripts_mo: 77,
      transcripts_mo: 38,
      automations: 20,
      publish_targets: 3,
      ig_connections: 1,
      model: "opus",
    };
    const sub = await getSubscription(
      fakeSupabase({ maybeSingle: { data: row({ tier: "custom", custom_entitlements: custom }), error: null } }),
      USER
    );
    expect(sub?.tier).toBe("custom");
    expect(sub?.customEntitlements).toEqual(custom);
  });

  it("falls back to null customEntitlements when the column is missing/malformed", async () => {
    const sub = await getSubscription(
      fakeSupabase({ maybeSingle: { data: row({ tier: "custom", custom_entitlements: { accounts: "not a number" } }), error: null } }),
      USER
    );
    expect(sub?.customEntitlements).toBeNull();
  });

  it("returns null when there is no row", async () => {
    const sub = await getSubscription(fakeSupabase({ maybeSingle: { data: null, error: null } }), USER);
    expect(sub).toBeNull();
  });

  it("fails open (null) on a DB error", async () => {
    const sub = await getSubscription(fakeSupabase({ maybeSingle: { data: null, error: { message: "boom" } } }), USER);
    expect(sub).toBeNull();
  });

  it("fails open (null) when the client throws", async () => {
    const sub = await getSubscription(throwingSupabase(), USER);
    expect(sub).toBeNull();
  });
});

describe("activeTierFromSubscription", () => {
  it("returns the tier only when the subscription is active", async () => {
    const active = await activeTierFromSubscription(
      fakeSupabase({ maybeSingle: { data: row({ tier: "studio", status: "active" }), error: null } }),
      USER
    );
    expect(active).toBe("studio");
  });

  it("returns null for an inactive subscription (caller applies its own fallback)", async () => {
    const inactive = await activeTierFromSubscription(
      fakeSupabase({ maybeSingle: { data: row({ tier: "studio", status: "canceled" }), error: null } }),
      USER
    );
    expect(inactive).toBeNull();
  });

  it("returns null when there is no subscription", async () => {
    const none = await activeTierFromSubscription(fakeSupabase({ maybeSingle: { data: null, error: null } }), USER);
    expect(none).toBeNull();
  });
});

describe("getPendingPlanChange", () => {
  function pendingRow(overrides: Record<string, unknown> = {}) {
    return {
      pending_tier: "pro",
      pending_effective_at: "2026-08-29T00:00:00Z",
      pending_price_aed: 149,
      pending_custom_entitlements: null,
      stripe_schedule_id: "sub_sched_1",
      ...overrides,
    };
  }

  it("maps a scheduled change", async () => {
    const pending = await getPendingPlanChange(
      fakeSupabase({ maybeSingle: { data: pendingRow(), error: null } }),
      USER
    );
    expect(pending).toMatchObject({
      tier: "pro",
      effectiveAt: "2026-08-29T00:00:00Z",
      priceAed: 149,
      scheduleId: "sub_sched_1",
    });
  });

  it("carries a custom plan's pending entitlements", async () => {
    const entitlements = {
      accounts: 40,
      scripts_mo: 80,
      transcripts_mo: 40,
      automations: 10,
      publish_targets: 2,
      ig_connections: 1,
      model: "opus",
    };
    const pending = await getPendingPlanChange(
      fakeSupabase({
        maybeSingle: {
          data: pendingRow({ pending_tier: "custom", pending_custom_entitlements: entitlements }),
          error: null,
        },
      }),
      USER
    );
    expect(pending?.entitlements).toMatchObject({ accounts: 40, model: "opus" });
  });

  it("reads 'nothing scheduled' for an empty or malformed pending tier", async () => {
    for (const pending_tier of [null, "", "not a slug"]) {
      const pending = await getPendingPlanChange(
        fakeSupabase({ maybeSingle: { data: pendingRow({ pending_tier }), error: null } }),
        USER
      );
      expect(pending).toBeNull();
    }
  });

  // The pending_* columns arrived in a later migration: on a database without
  // it, the billing page must still render the CURRENT plan rather than break.
  it("fails open (null) on a DB error or a throwing client", async () => {
    expect(
      await getPendingPlanChange(
        fakeSupabase({ maybeSingle: { data: null, error: { message: "column does not exist" } } }),
        USER
      )
    ).toBeNull();
    expect(await getPendingPlanChange(throwingSupabase(), USER)).toBeNull();
  });
});
