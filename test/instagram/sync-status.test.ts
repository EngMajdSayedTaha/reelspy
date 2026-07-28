import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createMetaRateLimiter,
  MetaRateLimitError,
  readAppPausedUntil,
  readUserQuota,
  userHourlyRefreshCap,
} from "@/lib/instagram/rate-limit";

// Records every consume_meta_quota call so we can assert what the USER was
// charged versus what the app bucket was charged — the whole point of the
// split. `deny` makes the next N calls come back as a denial.
function fakeLimiterClient(opts: { deny?: { reason: string; retry: number } } = {}) {
  const calls: Array<Record<string, unknown>> = [];
  const client = {
    rpc: async (_name: string, params: Record<string, unknown>) => {
      calls.push(params);
      if (opts.deny) {
        return {
          data: [{ allowed: false, reason: opts.deny.reason, retry_after_seconds: opts.deny.retry }],
          error: null,
        };
      }
      return { data: [{ allowed: true, reason: "ok", retry_after_seconds: 0 }], error: null };
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

function fakeReader(row: unknown): SupabaseClient {
  const b: Record<string, unknown> = {
    select: () => b,
    eq: () => b,
    maybeSingle: async () => ({ data: row, error: null }),
  };
  return { from: () => b } as unknown as SupabaseClient;
}

describe("userHourlyRefreshCap", () => {
  it("floors small plans so everyone gets a usable allowance", () => {
    // Free tracks 3 accounts but still gets the floor — the cap exists to stop
    // runaway loops, not to make a 3-account user wait an hour.
    expect(userHourlyRefreshCap(3)).toBe(20);
  });

  it("scales with the plan so a big plan can refresh its whole list hourly", () => {
    expect(userHourlyRefreshCap(30)).toBe(30); // creator
    expect(userHourlyRefreshCap(50)).toBe(50); // pro
    expect(userHourlyRefreshCap(100)).toBe(100); // studio
  });

  it("maps UNLIMITED to the hard ceiling rather than 0 or NaN", () => {
    expect(userHourlyRefreshCap(-1)).toBe(500);
    expect(userHourlyRefreshCap(Number.NaN)).toBe(500);
  });
});

describe("MetaRateLimiter operation billing", () => {
  it("charges the user once per refresh but the app bucket once per page", async () => {
    const { client, calls } = fakeLimiterClient();
    const limiter = createMetaRateLimiter(client, "u1", 20);

    // One account refresh that pages four times internally.
    limiter.startOperation();
    for (let i = 0; i < 4; i++) await limiter.acquire();
    limiter.endOperation();

    expect(calls).toHaveLength(4);
    // App bucket: every page costs a token, because every page is a real call.
    expect(calls.map((c) => c.p_cost)).toEqual([1, 1, 1, 1]);
    // User: billed for one refresh, not four pages. This is the regression that
    // made depth 200 cost 20× depth 25 with nothing in the UI saying so.
    expect(calls.map((c) => c.p_user_cost)).toEqual([1, 0, 0, 0]);
  });

  it("bills each new operation again", async () => {
    const { client, calls } = fakeLimiterClient();
    const limiter = createMetaRateLimiter(client, "u1", 20);

    for (let account = 0; account < 2; account++) {
      limiter.startOperation();
      await limiter.acquire();
      await limiter.acquire();
      limiter.endOperation();
    }

    expect(calls.map((c) => c.p_user_cost)).toEqual([1, 0, 1, 0]);
  });

  it("bills a standalone call as its own refresh", async () => {
    // Adding an account / a profile lookup makes exactly one call and never
    // opens an operation — it must still cost the user something.
    const { client, calls } = fakeLimiterClient();
    await createMetaRateLimiter(client, "u1", 20).acquire();
    expect(calls[0].p_user_cost).toBe(1);
  });

  it("passes the plan-derived cap through to the RPC", async () => {
    const { client, calls } = fakeLimiterClient();
    await createMetaRateLimiter(client, "u1", userHourlyRefreshCap(100)).acquire();
    expect(calls[0].p_user_cap).toBe(100);
  });

  it("fails open when the limiter RPC errors", async () => {
    const client = {
      rpc: async () => ({ data: null, error: { message: "relation does not exist" } }),
    } as unknown as SupabaseClient;
    // Must not throw: a feature never hard-breaks on the guard's own infra.
    await expect(createMetaRateLimiter(client, "u1", 20).acquire()).resolves.toBeUndefined();
  });
});

describe("rate limit messaging", () => {
  it("owns a personal quota but blames Instagram for an app-wide pause", async () => {
    const own = new MetaRateLimitError("user_quota", 600);
    expect(own.message).toContain("You've refreshed a lot of accounts");
    expect(own.message).toContain("10 min");

    // circuit_open / app_budget are not the user's doing and must not read as a
    // limit on their account — that phrasing is what made paying customers
    // think the plan they bought was being withheld.
    for (const reason of ["circuit_open", "app_budget", "rate_limited"]) {
      const shared = new MetaRateLimitError(reason, 600);
      expect(shared.message).toContain("Instagram has paused new requests for everyone");
      expect(shared.message).not.toContain("your hourly");
    }
  });
});

describe("readUserQuota", () => {
  it("reports an in-flight window with an absolute reset instant", async () => {
    const startedAt = new Date(Date.now() - 10 * 60_000).toISOString();
    const quota = await readUserQuota(fakeReader({ window_start: startedAt, call_count: 7 }), "u1", 30);

    expect(quota.used).toBe(7);
    expect(quota.limit).toBe(30);
    // ~50 minutes left in the hour.
    const leftMs = new Date(quota.resetAt as string).getTime() - Date.now();
    expect(leftMs).toBeGreaterThan(49 * 60_000);
    expect(leftMs).toBeLessThan(51 * 60_000);
  });

  it("reads an expired window as a fresh one", async () => {
    // consume_meta_quota resets it on the next call, so reporting the stale
    // count would contradict what the user would actually get if they clicked.
    const startedAt = new Date(Date.now() - 2 * 3600_000).toISOString();
    const quota = await readUserQuota(fakeReader({ window_start: startedAt, call_count: 19 }), "u1", 20);
    expect(quota).toEqual({ used: 0, limit: 20, resetAt: null });
  });

  it("never reports more used than the cap", async () => {
    // The unit changed from HTTP calls to refreshes; a row written under the old
    // scale must not render as a negative remainder.
    const startedAt = new Date(Date.now() - 60_000).toISOString();
    const quota = await readUserQuota(fakeReader({ window_start: startedAt, call_count: 80 }), "u1", 20);
    expect(quota.used).toBe(20);
  });

  it("treats a missing row as an untouched window", async () => {
    expect(await readUserQuota(fakeReader(null), "u1", 20)).toEqual({
      used: 0,
      limit: 20,
      resetAt: null,
    });
  });
});

describe("readAppPausedUntil", () => {
  it("returns the deadline while the circuit is open", async () => {
    const until = new Date(Date.now() + 15 * 60_000).toISOString();
    expect(await readAppPausedUntil(fakeReader({ throttled_until: until }))).toBe(until);
  });

  it("returns null once the deadline has passed", async () => {
    // The client derives its countdown from this instant, so a stale deadline
    // would show a cooldown that already ended.
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(await readAppPausedUntil(fakeReader({ throttled_until: past }))).toBeNull();
  });

  it("returns null when nothing has ever tripped", async () => {
    expect(await readAppPausedUntil(fakeReader({ throttled_until: null }))).toBeNull();
  });
});
