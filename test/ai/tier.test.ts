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

// isAiTier validates a slug's SHAPE, not its membership of a fixed list: plans
// are admin-created now, so a slug this build has never heard of is still the
// customer's real plan and must survive being read back. Whether a plan actually
// EXISTS and is sellable is a catalog question, asked on the write paths.
describe("isAiTier", () => {
  it("accepts the built-in tiers", () => {
    for (const t of ["free", "creator", "pro", "studio", "custom"]) expect(isAiTier(t)).toBe(true);
  });

  it("accepts a well-formed slug an admin could have created", () => {
    expect(isAiTier("enterprise")).toBe(true);
    expect(isAiTier("agency-plus")).toBe(true);
    expect(isAiTier("tier_2")).toBe(true);
  });

  it("rejects malformed and empty values", () => {
    expect(isAiTier("")).toBe(false);
    expect(isAiTier("x")).toBe(false);              // too short
    expect(isAiTier("Agency")).toBe(false);         // not lower-case
    expect(isAiTier("2fast")).toBe(false);          // must start with a letter
    expect(isAiTier("has space")).toBe(false);
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

  it("lets an active custom-plan subscription resolve to \"custom\" (B4)", async () => {
    vi.stubEnv("AI_DEFAULT_TIER", "free");
    const tier = await resolveUserTier(
      fakeSupabase({ maybeSingle: { data: subRow("custom"), error: null } }),
      USER
    );
    expect(tier).toBe("custom");
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
