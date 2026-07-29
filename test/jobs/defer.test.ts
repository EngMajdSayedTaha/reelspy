import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deferJob, jitterMs } from "@/lib/jobs/queue";

// deferJob exists to separate "couldn't be attempted" from "was attempted and
// broke". It is the fix for the incident where a 1-hour Instagram cooldown ate a
// refresh job's entire 5-attempt budget (~15 min of exponential backoff) and
// parked it as `failed` ~45 minutes before the circuit could ever reopen — with
// nothing left to revive it. The attempt rollback is what keeps a deferral free.

type UpdatePayload = Record<string, unknown>;

function fakeJobsClient(): { client: SupabaseClient; updates: UpdatePayload[] } {
  const updates: UpdatePayload[] = [];
  const builder = {
    update: (payload: UpdatePayload) => {
      updates.push(payload);
      return builder;
    },
    eq: async () => ({ data: null, error: null }),
  };
  const client = { from: () => builder } as unknown as SupabaseClient;
  return { client, updates };
}

describe("deferJob — a throttle is a deferral, not a failure", () => {
  it("rolls back the attempt that claim_jobs incremented", async () => {
    const { client, updates } = fakeJobsClient();
    // claim_jobs bumped attempts to 3 when it handed the job out.
    await deferJob(client, { id: "job-1", attempts: 3 }, new Date("2026-08-01T10:00:00Z"), "throttled");

    expect(updates).toHaveLength(1);
    // Back to 2 — the deferral consumed nothing.
    expect(updates[0].attempts).toBe(2);
  });

  it("never drives attempts negative", async () => {
    const { client, updates } = fakeJobsClient();
    await deferJob(client, { id: "job-1", attempts: 0 }, new Date(), "throttled");
    expect(updates[0].attempts).toBe(0);
  });

  it("requeues the job at the requested time and releases the lock", async () => {
    const { client, updates } = fakeJobsClient();
    const runAt = new Date("2026-08-01T13:25:00Z");
    await deferJob(client, { id: "job-1", attempts: 1 }, runAt, "circuit open");

    expect(updates[0].status).toBe("queued");
    expect(updates[0].run_at).toBe(runAt.toISOString());
    // Released so a later worker pass can claim it again.
    expect(updates[0].locked_at).toBeNull();
    expect(updates[0].locked_by).toBeNull();
  });

  it("records the reason without letting a huge message bloat the row", async () => {
    const { client, updates } = fakeJobsClient();
    await deferJob(client, { id: "job-1", attempts: 1 }, new Date(), "x".repeat(5000));
    expect(String(updates[0].last_error)).toHaveLength(1000);
  });

  it("survives repeated deferrals without ever exhausting attempts", async () => {
    const { client, updates } = fakeJobsClient();
    // Simulate the real loop: claim bumps to N+1, defer rolls back to N.
    let attempts = 0;
    for (let i = 0; i < 20; i++) {
      attempts += 1; // claim_jobs
      await deferJob(client, { id: "job-1", attempts }, new Date(), "throttled");
      attempts = updates[updates.length - 1].attempts as number;
    }
    // Twenty cooldowns later the job is still as retryable as it started.
    expect(attempts).toBe(0);
  });
});

describe("jitterMs — spreads deferred wake-ups", () => {
  it("stays within [0, spread)", () => {
    for (let i = 0; i < 200; i++) {
      const value = jitterMs(60_000);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(60_000);
    }
  });

  it("is an integer (milliseconds, not fractions)", () => {
    expect(Number.isInteger(jitterMs(1000))).toBe(true);
  });

  it("handles a zero/negative spread without producing NaN", () => {
    expect(jitterMs(0)).toBe(0);
    expect(jitterMs(-5)).toBe(0);
  });

  it("actually varies, so a batch doesn't wake in lockstep", () => {
    const spy = vi.spyOn(Math, "random");
    spy.mockReturnValueOnce(0).mockReturnValueOnce(0.99);
    expect(jitterMs(60_000)).toBe(0);
    expect(jitterMs(60_000)).toBe(59_400);
    spy.mockRestore();
  });
});
