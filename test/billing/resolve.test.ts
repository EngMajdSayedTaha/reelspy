import { describe, it, expect, afterEach, vi } from "vitest";
import { resolveUserEntitlements } from "@/lib/billing/resolve";
import { ENTITLEMENTS } from "@/lib/billing/entitlements";
import { fakeSupabase } from "../helpers/fake-supabase";

const USER = "user-1";

afterEach(() => {
  vi.unstubAllEnvs();
});

// fakeSupabase answers every .from(...).select().eq().maybeSingle() with the
// same fixture, so one row can stand in for both the profiles (is_admin) and
// subscriptions reads resolveUserEntitlements' dependencies make.
function row(overrides: Record<string, unknown> = {}) {
  return {
    is_admin: false,
    tier: "pro",
    status: "active",
    stripe_customer_id: "cus_1",
    stripe_subscription_id: "sub_1",
    current_period_end: "2026-08-01T00:00:00Z",
    cancel_at_period_end: false,
    custom_entitlements: null,
    ...overrides,
  };
}

describe("resolveUserEntitlements", () => {
  it("returns the fixed tier's entitlements for a non-custom subscriber", async () => {
    const { tier, entitlements } = await resolveUserEntitlements(
      fakeSupabase({ maybeSingle: { data: row({ tier: "pro" }), error: null } }),
      USER
    );
    expect(tier).toBe("pro");
    expect(entitlements).toBe(ENTITLEMENTS.pro);
  });

  it("returns the subscriber's own custom_entitlements for tier=custom", async () => {
    const custom = {
      accounts: 42,
      scripts_mo: 77,
      transcripts_mo: 38,
      automations: 20,
      publish_targets: 3,
      ig_connections: 1,
      model: "opus",
    };
    const { tier, entitlements } = await resolveUserEntitlements(
      fakeSupabase({ maybeSingle: { data: row({ tier: "custom", custom_entitlements: custom }), error: null } }),
      USER
    );
    expect(tier).toBe("custom");
    expect(entitlements).toEqual(custom);
  });

  it("falls back to ENTITLEMENTS.custom when a custom subscriber has no synced row yet", async () => {
    const { entitlements } = await resolveUserEntitlements(
      fakeSupabase({ maybeSingle: { data: row({ tier: "custom", custom_entitlements: null }), error: null } }),
      USER
    );
    expect(entitlements).toBe(ENTITLEMENTS.custom);
  });
});
