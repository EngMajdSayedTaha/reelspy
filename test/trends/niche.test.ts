import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  listNiches,
  nicheTrending,
  slugifyNiche,
  viralScore,
  ALL_NICHES,
} from "@/lib/trends/niche";

// Per-table canned responses. Every builder method returns the builder; the
// builder is thenable and resolves to { data, error } for its table. Mirrors the
// admin-client chains niche.ts uses (select/eq/in/gte/returns then await).
function fakeAdmin(tables: Record<string, unknown[]>): SupabaseClient {
  const make = (table: string) => {
    const result = { data: tables[table] ?? [], error: null };
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      gte: () => builder,
      returns: () => builder,
      then: (resolve: (v: unknown) => unknown) => resolve(result),
    };
    return builder;
  };
  return { from: (t: string) => make(t) } as unknown as SupabaseClient;
}

describe("pure helpers", () => {
  it("viralScore mirrors the tracked_reels formula", () => {
    expect(viralScore(10, 2, 1000)).toBe(10 * 1 + 2 * 3 + 1000 * 0.01);
  });
  it("slugifyNiche lowercases + collapses whitespace", () => {
    expect(slugifyNiche("  Real   Estate ")).toBe("real estate");
    expect(slugifyNiche("Fitness")).toBe("fitness");
  });
});

describe("listNiches", () => {
  it("aggregates group names across users, gated by minAccounts", async () => {
    const admin = fakeAdmin({
      account_groups: [
        { id: "g1", name: "Real Estate" },
        { id: "g2", name: "real estate" }, // different user, same niche after slug
        { id: "g3", name: "Fitness" },
      ],
      inspiration_accounts: [
        { user_id: "u1", ig_username: "aaa", group_id: "g1" },
        { user_id: "u2", ig_username: "bbb", group_id: "g2" },
        { user_id: "u1", ig_username: "ccc", group_id: "g3" }, // fitness: only 1 account
      ],
    });

    const niches = await listNiches(admin, { minAccounts: 2 });
    expect(niches).toHaveLength(1);
    expect(niches[0]).toMatchObject({ niche: "real estate", accountCount: 2, taggerCount: 2 });
  });
});

describe("nicheTrending (size control)", () => {
  const now = Date.now();
  const iso = (d: number) => new Date(now - d * 86_400_000).toISOString();

  it("ranks a small-account outlier above a big account's baseline reel", async () => {
    const admin = fakeAdmin({
      account_groups: [{ id: "g1", name: "Real Estate" }],
      inspiration_accounts: [
        { user_id: "u1", ig_username: "bigco", group_id: "g1" },
        { user_id: "u2", ig_username: "tinyco", group_id: "g1" },
      ],
      ig_account_snapshots: [
        { ig_username: "bigco", followers_count: 1_000_000 },
        { ig_username: "tinyco", followers_count: 5_000 },
      ],
      ig_reel_snapshots: [
        // bigco: high absolute views but all near its own median (not an outlier)
        { ig_username: "bigco", ig_media_id: "b1", permalink: "p", caption: "c", thumbnail_url: "t", view_count: 500_000, like_count: 10_000, comment_count: 500, posted_at: iso(2) },
        { ig_username: "bigco", ig_media_id: "b2", permalink: "p", caption: "c", thumbnail_url: "t", view_count: 480_000, like_count: 9_500, comment_count: 480, posted_at: iso(3) },
        // tinyco: one massive outlier vs its own median
        { ig_username: "tinyco", ig_media_id: "t1", permalink: "p", caption: "c", thumbnail_url: "t", view_count: 200_000, like_count: 8_000, comment_count: 400, posted_at: iso(1) },
        { ig_username: "tinyco", ig_media_id: "t2", permalink: "p", caption: "c", thumbnail_url: "t", view_count: 2_000, like_count: 80, comment_count: 4, posted_at: iso(4) },
      ],
    });

    const reels = await nicheTrending(admin, { niche: "real estate", days: 30, limit: 10 });
    expect(reels.length).toBeGreaterThan(0);
    // Size control: tinyco's outlier wins on audience-normalized score.
    expect(reels[0].igUsername).toBe("tinyco");
    expect(reels[0].outperformRatio).toBeGreaterThan(1.5);
  });

  it("returns empty when the niche has no accounts", async () => {
    const admin = fakeAdmin({ account_groups: [], inspiration_accounts: [] });
    expect(await nicheTrending(admin, { niche: "ghost" })).toEqual([]);
  });

  it("ALL_NICHES spans every tracked account regardless of grouping", async () => {
    const admin = fakeAdmin({
      account_groups: [],
      inspiration_accounts: [{ user_id: "u1", ig_username: "solo", group_id: null }],
      ig_account_snapshots: [{ ig_username: "solo", followers_count: 10_000 }],
      ig_reel_snapshots: [
        { ig_username: "solo", ig_media_id: "s1", permalink: "p", caption: "c", thumbnail_url: "t", view_count: 50_000, like_count: 2_000, comment_count: 100, posted_at: iso(1) },
      ],
    });
    const reels = await nicheTrending(admin, { niche: ALL_NICHES, days: 30 });
    expect(reels).toHaveLength(1);
    expect(reels[0].igUsername).toBe("solo");
  });
});
