import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readAccountDetail } from "@/lib/accounts/detail";

/**
 * Per-table fake: `readAccountDetail` issues seven different queries across five
 * tables, so the shared `fakeSupabase` helper (one canned result for everything)
 * cannot express what this module needs to be tested for.
 *
 * The builder is thenable so an awaited list query resolves, and also carries
 * `maybeSingle()` for the single-row reads.
 */
function fakeClient(opts: {
  tables?: Record<string, unknown[]>;
  rpc?: Record<string, unknown[]>;
  /** Tables that blow up, to simulate an unapplied migration. */
  failing?: string[];
}): SupabaseClient {
  const tables = opts.tables ?? {};
  const rpcs = opts.rpc ?? {};
  const failing = new Set(opts.failing ?? []);

  const makeBuilder = (table: string) => {
    const error = failing.has(table) ? { message: `relation "${table}" does not exist` } : null;
    const data = error ? null : (tables[table] ?? []);
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    Object.assign(builder, {
      select: chain,
      eq: chain,
      not: chain,
      or: chain,
      in: chain,
      filter: chain,
      order: chain,
      limit: chain,
      maybeSingle: async () => ({
        data: Array.isArray(data) ? (data[0] ?? null) : null,
        error,
      }),
      then: (resolve: (v: unknown) => unknown) => resolve({ data, error }),
    });
    return builder;
  };

  return {
    from: (table: string) => makeBuilder(table),
    rpc: async (name: string) => {
      if (failing.has(name)) return { data: null, error: { message: `function ${name} missing` } };
      return { data: rpcs[name] ?? [], error: null };
    },
  } as unknown as SupabaseClient;
}

const ACCOUNT = {
  id: "acc-1",
  ig_username: "someone",
  display_name: "Some One",
  avatar_url: null,
  followers_count: 10_000,
  is_active: true,
  last_synced_at: "2026-06-01T00:00:00.000Z",
  created_at: "2026-01-01T00:00:00.000Z",
  group_id: "grp-1",
  account_groups: { name: "Competitors" },
};

const REELS = [
  {
    id: "r1",
    view_count: 1_000,
    like_count: 100,
    comment_count: 10,
    viral_score: "110",
    posted_at: "2026-05-01T00:00:00.000Z",
    created_at: "2026-05-02T00:00:00.000Z",
    caption: "#tag",
    thumbnail_url: null,
    ig_permalink: "https://example.test/r1",
    transcript_status: "ready",
    is_favorite: true,
    is_worked_on: false,
  },
];

function baseTables() {
  return {
    inspiration_accounts: [ACCOUNT],
    tracked_reels: REELS,
    account_groups: [{ id: "grp-1", name: "Competitors" }],
    ig_account_archives: [],
    ig_account_archive_requests: [],
    ig_account_metric_history: [],
    jobs: [],
    app_events: [],
  };
}

describe("readAccountDetail", () => {
  it("returns null for an account the RLS client cannot see", async () => {
    const supabase = fakeClient({ tables: { inspiration_accounts: [] } });
    const result = await readAccountDetail(supabase, null, "user-1", "missing");
    expect(result).toBeNull();
  });

  it("flattens the embedded group name", async () => {
    const supabase = fakeClient({ tables: baseTables() });
    const result = await readAccountDetail(supabase, null, "user-1", "acc-1");
    expect(result?.account.group_name).toBe("Competitors");
  });

  it("degrades instead of throwing when there is no service-role client", async () => {
    const supabase = fakeClient({ tables: baseTables() });
    const result = await readAccountDetail(supabase, null, "user-1", "acc-1");

    expect(result).not.toBeNull();
    expect(result?.degraded).toBe(true);
    expect(result?.archive).toBeNull();
    expect(result?.transcribe).toBeNull();
    expect(result?.history).toEqual([]);
    expect(result?.activity).toEqual([]);
    // The RLS-scoped half of the page is unaffected.
    expect(result?.reels).toHaveLength(1);
  });

  it("degrades when the admin client throws mid-flight", async () => {
    const supabase = fakeClient({ tables: baseTables() });
    const admin = {
      from: () => {
        throw new Error("service role key rejected");
      },
      rpc: async () => ({ data: null, error: null }),
    } as unknown as SupabaseClient;

    const result = await readAccountDetail(supabase, admin, "user-1", "acc-1");

    expect(result).not.toBeNull();
    expect(result?.degraded).toBe(true);
    expect(result?.archive).toBeNull();
    expect(result?.reels).toHaveLength(1);
  });

  it("falls back to window-scoped aggregates when the RPC is missing", async () => {
    // This is the state between merging the code and applying the migration.
    const supabase = fakeClient({ tables: baseTables(), failing: ["account_insights"] });
    const result = await readAccountDetail(supabase, null, "user-1", "acc-1");

    expect(result?.aggregates.exact).toBe(false);
    expect(result?.aggregates.reelsTotal).toBe(1);
    expect(result?.aggregates.viewsTotal).toBe(1_000);
    expect(result?.aggregates.viewsMedian).toBe(1_000);
    expect(result?.aggregates.transcriptsReady).toBe(1);
  });

  it("marks aggregates exact and coerces the RPC's numeric strings", async () => {
    // PostgREST returns `numeric` columns as strings.
    const supabase = fakeClient({
      tables: baseTables(),
      rpc: {
        account_insights: [
          {
            reels_total: "42",
            views_total: "5000",
            views_median: "1200.5",
            views_avg: null,
            first_posted_at: "2026-01-01T00:00:00.000Z",
            transcripts_ready: "7",
            scripts_generated: "3",
          },
        ],
      },
    });
    const result = await readAccountDetail(supabase, null, "user-1", "acc-1");

    expect(result?.aggregates.exact).toBe(true);
    expect(result?.aggregates.reelsTotal).toBe(42);
    expect(result?.aggregates.viewsTotal).toBe(5_000);
    expect(result?.aggregates.viewsMedian).toBe(1200.5);
    expect(result?.aggregates.viewsAvg).toBeNull();
    expect(result?.aggregates.scriptsGenerated).toBe(3);
  });

  it("skips the outperformers RPC for a paused account", async () => {
    // The RPC inner-joins is_active = true, so it would always return nothing —
    // an empty section would read as "no standout reels" rather than "paused".
    const tables = baseTables();
    tables.inspiration_accounts = [{ ...ACCOUNT, is_active: false }];
    const supabase = fakeClient({
      tables,
      rpc: { outperforming_feed: [{ id: "should-not-appear" }] },
    });

    const result = await readAccountDetail(supabase, null, "user-1", "acc-1");
    expect(result?.outperformers).toEqual([]);
  });
});
