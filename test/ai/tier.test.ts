import { describe, it, expect, afterEach, vi } from "vitest";
import { isAiTier, resolveUserTier } from "@/lib/ai/tier";
import { fakeSupabase } from "../helpers/fake-supabase";

const USER = "user-1";

afterEach(() => {
  vi.unstubAllEnvs();
});

function subRow(tier: string, status = "active") {
  return {
    tier,
    status,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    current_period_end: null,
    cancel_at_period_end: false,
  };
}

describe("isAiTier", () => {
  it("accepts the four valid tiers", () => {
    for (const t of ["free", "creator", "pro", "studio"]) expect(isAiTier(t)).toBe(true);
  });

  it("rejects unknown/empty values", () => {
    expect(isAiTier("enterprise")).toBe(false);
    expect(isAiTier("")).toBe(false);
    expect(isAiTier(null)).toBe(false);
    expect(isAiTier(undefined)).toBe(false);
  });
});

describe("resolveUserTier", () => {
  it("lets an active subscription win over the env default", async () => {
    vi.stubEnv("AI_DEFAULT_TIER", "free");
    const tier = await resolveUserTier(
      fakeSupabase({ maybeSingle: { data: subRow("pro"), error: null } }),
      USER
    );
    expect(tier).toBe("pro");
  });

  it("falls back to AI_DEFAULT_TIER when there is no active subscription", async () => {
    vi.stubEnv("AI_DEFAULT_TIER", "creator");
    const tier = await resolveUserTier(
      fakeSupabase({ maybeSingle: { data: null, error: null } }),
      USER
    );
    expect(tier).toBe("creator");
  });

  it("ignores a canceled subscription and uses the env default", async () => {
    vi.stubEnv("AI_DEFAULT_TIER", "free");
    const tier = await resolveUserTier(
      fakeSupabase({ maybeSingle: { data: subRow("studio", "canceled"), error: null } }),
      USER
    );
    expect(tier).toBe("free");
  });

  it("defaults to free when AI_DEFAULT_TIER is unset or invalid", async () => {
    vi.stubEnv("AI_DEFAULT_TIER", "");
    expect(await resolveUserTier(fakeSupabase({ maybeSingle: { data: null, error: null } }), USER)).toBe("free");
    vi.stubEnv("AI_DEFAULT_TIER", "garbage");
    expect(await resolveUserTier(fakeSupabase({ maybeSingle: { data: null, error: null } }), USER)).toBe("free");
  });
});
