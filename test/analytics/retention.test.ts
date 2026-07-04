import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pruneEventLogs } from "@/lib/analytics/retention";

// Records each delete chain the pruner issues and returns a configured result
// per table. Mirrors the exact call shape retention.ts uses:
//   from(t).delete({count}).lt('created_at', cutoff)        (event tables)
//   from(t).delete({count}).in('status', [...]).lt(...)     (jobs)
// The builder is thenable so `await ...lt(...)` resolves.
type TableCfg = { count?: number; error?: string };
function fakeAdmin(perTable: Record<string, TableCfg> = {}) {
  const calls: Array<{ table: string; ltVal?: string; inVals?: unknown }> = [];
  function makeBuilder(table: string) {
    const state: { table: string; ltVal?: string; inVals?: unknown } = { table };
    const settle = () => {
      calls.push(state);
      const cfg = perTable[table] ?? { count: 0 };
      const result = cfg.error
        ? { count: null, error: { message: cfg.error } }
        : { count: cfg.count ?? 0, error: null };
      return { then: (resolve: (v: unknown) => unknown) => resolve(result) };
    };
    const builder = {
      delete: () => builder,
      in: (_col: string, vals: unknown) => {
        state.inVals = vals;
        return builder;
      },
      lt: (_col: string, val: string) => {
        state.ltVal = val;
        return settle();
      },
    };
    return builder;
  }
  const client = { from: (t: string) => makeBuilder(t) } as unknown as SupabaseClient;
  return { client, calls };
}

const NOW = Date.UTC(2027, 0, 1); // fixed clock so cutoffs are deterministic
const DAY = 86_400_000;

describe("pruneEventLogs", () => {
  it("prunes all four tables and sums the deleted counts", async () => {
    const { client, calls } = fakeAdmin({
      app_events: { count: 3 },
      ai_usage: { count: 1 },
      automation_events: { count: 2 },
      jobs: { count: 5 },
    });
    const result = await pruneEventLogs(client, NOW);

    expect(result.deleted).toEqual({
      app_events: 3,
      ai_usage: 1,
      automation_events: 2,
      jobs: 5,
    });
    expect(result.errors).toEqual({});
    expect(calls.map((c) => c.table)).toEqual([
      "app_events",
      "ai_usage",
      "automation_events",
      "jobs",
    ]);
  });

  it("uses the 365-day window for events and 30-day for jobs", async () => {
    const { client, calls } = fakeAdmin();
    const result = await pruneEventLogs(client, NOW);

    expect(result.cutoffs.events).toBe(new Date(NOW - 365 * DAY).toISOString());
    expect(result.cutoffs.jobs).toBe(new Date(NOW - 30 * DAY).toISOString());
    for (const c of calls) {
      const expected = c.table === "jobs" ? result.cutoffs.jobs : result.cutoffs.events;
      expect(c.ltVal).toBe(expected);
    }
  });

  it("only deletes terminal jobs (done/failed)", async () => {
    const { client, calls } = fakeAdmin();
    await pruneEventLogs(client, NOW);
    const jobsCall = calls.find((c) => c.table === "jobs");
    expect(jobsCall?.inVals).toEqual(["done", "failed"]);
  });

  it("captures a per-table error without aborting the rest", async () => {
    const { client } = fakeAdmin({
      app_events: { error: "boom" },
      ai_usage: { count: 4 },
      automation_events: { count: 0 },
      jobs: { count: 1 },
    });
    const result = await pruneEventLogs(client, NOW);

    expect(result.errors.app_events).toBe("boom");
    expect(result.deleted.app_events).toBeUndefined();
    // Later tables still ran.
    expect(result.deleted.ai_usage).toBe(4);
    expect(result.deleted.jobs).toBe(1);
  });
});
