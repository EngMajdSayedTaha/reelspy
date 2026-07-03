import { describe, it, expect } from "vitest";
import { consumeMonthlyQuota, monthlyLimitMessage } from "@/lib/billing/quota";
import { fakeSupabase, throwingSupabase } from "../helpers/fake-supabase";

const USER = "user-1";

describe("consumeMonthlyQuota", () => {
  it("short-circuits unlimited tiers without touching the DB", async () => {
    // studio.scripts_mo is UNLIMITED; a throwing client proves no RPC is made.
    const res = await consumeMonthlyQuota(throwingSupabase(), USER, "studio", "scripts_mo");
    expect(res).toMatchObject({ allowed: true, remaining: -1, limit: -1 });
  });

  it("allows and reports usage when the RPC says allowed", async () => {
    const res = await consumeMonthlyQuota(
      fakeSupabase({ rpc: { data: [{ allowed: true, used: 5, remaining: 55, period_end: "2026-08-01" }], error: null } }),
      USER,
      "creator",
      "scripts_mo"
    );
    expect(res).toMatchObject({ allowed: true, used: 5, remaining: 55, limit: 60, resetAt: "2026-08-01" });
  });

  it("denies when the RPC says the cap is reached", async () => {
    const res = await consumeMonthlyQuota(
      fakeSupabase({ rpc: { data: [{ allowed: false, used: 60, remaining: 0, period_end: "2026-08-01" }], error: null } }),
      USER,
      "creator",
      "scripts_mo"
    );
    expect(res.allowed).toBe(false);
    expect(res.used).toBe(60);
  });

  it("fails open (allowed) when the RPC errors — billing infra must not hard-break", async () => {
    const res = await consumeMonthlyQuota(
      fakeSupabase({ rpc: { data: null, error: { message: "rpc missing" } } }),
      USER,
      "free",
      "scripts_mo"
    );
    expect(res).toMatchObject({ allowed: true, limit: 10 });
  });

  it("fails open when the client throws", async () => {
    const res = await consumeMonthlyQuota(throwingSupabase(), USER, "creator", "transcripts_mo");
    expect(res.allowed).toBe(true);
    expect(res.limit).toBe(30);
  });
});

describe("monthlyLimitMessage", () => {
  it("names the metered noun and the cap", () => {
    expect(monthlyLimitMessage("scripts_mo", 10, null)).toContain("10 scripts");
    expect(monthlyLimitMessage("transcripts_mo", 30, null)).toContain("30 transcripts");
  });

  it("includes a reset date when provided", () => {
    const msg = monthlyLimitMessage("scripts_mo", 10, "2026-08-01T00:00:00Z");
    expect(msg).toMatch(/resets on/i);
  });
});
