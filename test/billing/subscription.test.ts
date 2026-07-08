import { describe, it, expect } from "vitest";
import { getSubscription, activeTierFromSubscription } from "@/lib/billing/subscription";
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

  it("coerces an invalid tier to free", async () => {
    const sub = await getSubscription(fakeSupabase({ maybeSingle: { data: row({ tier: "bogus" }), error: null } }), USER);
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
