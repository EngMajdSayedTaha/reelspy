import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveNicheSlug, suggestedAccounts } from "@/lib/suggestions/accounts";
import type { NicheSummary } from "@/lib/trends/shared";

// Mirrors test/trends/niche.test.ts's fakeAdmin: per-table canned responses,
// thenable builder chain matching what nicheTrending/ig_account_snapshots use.
function fakeAdmin(tables: Record<string, unknown[]>): SupabaseClient {
  const make = (table: string) => {
    const result = { data: tables[table] ?? [], error: null };
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      gte: () => builder,
      order: () => builder,
      limit: () => builder,
      returns: () => builder,
      then: (resolve: (v: unknown) => unknown) => resolve(result),
    };
    return builder;
  };
  return { from: (t: string) => make(t) } as unknown as SupabaseClient;
}

const NICHES: NicheSummary[] = [
  { niche: "real estate", accountCount: 10, taggerCount: 5 },
  { niche: "fitness", accountCount: 8, taggerCount: 4 },
];

describe("resolveNicheSlug (pure string matching — no AI configured in tests)", () => {
  it("matches exactly after slugifying", async () => {
    expect(await resolveNicheSlug("Real Estate", NICHES)).toBe("real estate");
  });

  it("matches via substring", async () => {
    expect(await resolveNicheSlug("real estate agent", NICHES)).toBe("real estate");
  });

  it("matches via word overlap", async () => {
    expect(await resolveNicheSlug("estate real", NICHES)).toBe("real estate");
  });

  it("returns null when nothing matches and no AI provider is configured", async () => {
    expect(await resolveNicheSlug("underwater basket weaving", NICHES)).toBeNull();
  });

  it("returns null for an empty niche or empty taxonomy", async () => {
    expect(await resolveNicheSlug("   ", NICHES)).toBeNull();
    expect(await resolveNicheSlug("fitness", [])).toBeNull();
  });
});

describe("suggestedAccounts", () => {
  const now = Date.now();
  const iso = (d: number) => new Date(now - d * 86_400_000).toISOString();

  const REEL_SNAPSHOTS = [
    {
      ig_username: "outlier",
      ig_media_id: "o1",
      permalink: "p",
      caption: "c",
      thumbnail_url: "t",
      view_count: 200_000,
      like_count: 8_000,
      comment_count: 400,
      posted_at: iso(1),
    },
    {
      ig_username: "outlier",
      ig_media_id: "o2",
      permalink: "p",
      caption: "c",
      thumbnail_url: "t",
      view_count: 2_000,
      like_count: 80,
      comment_count: 4,
      posted_at: iso(4),
    },
    {
      ig_username: "baseline",
      ig_media_id: "b1",
      permalink: "p",
      caption: "c",
      thumbnail_url: "t",
      view_count: 500_000,
      like_count: 10_000,
      comment_count: 500,
      posted_at: iso(2),
    },
    {
      ig_username: "baseline",
      ig_media_id: "b2",
      permalink: "p",
      caption: "c",
      thumbnail_url: "t",
      view_count: 480_000,
      like_count: 9_500,
      comment_count: 480,
      posted_at: iso(3),
    },
    {
      ig_username: "already-tracked",
      ig_media_id: "e1",
      permalink: "p",
      caption: "c",
      thumbnail_url: "t",
      view_count: 900_000,
      like_count: 20_000,
      comment_count: 900,
      posted_at: iso(1),
    },
  ];

  function realEstateAdmin() {
    return fakeAdmin({
      account_groups: [{ id: "g1", name: "Real Estate" }],
      inspiration_accounts: [
        { user_id: "u1", ig_username: "outlier", group_id: "g1" },
        { user_id: "u2", ig_username: "baseline", group_id: "g1" },
        { user_id: "u3", ig_username: "already-tracked", group_id: "g1" },
      ],
      ig_account_snapshots: [
        { ig_username: "outlier", followers_count: 5_000, display_name: "Outlier", avatar_url: null },
        { ig_username: "baseline", followers_count: 1_000_000, display_name: "Baseline", avatar_url: null },
        {
          ig_username: "already-tracked",
          followers_count: 50_000,
          display_name: "Already Tracked",
          avatar_url: null,
        },
      ],
      ig_reel_snapshots: REEL_SNAPSHOTS,
    });
  }

  it("excludes accounts the user already tracks", async () => {
    const { accounts } = await suggestedAccounts(realEstateAdmin(), {
      nicheSlug: "real estate",
      excludeUsernames: ["already-tracked"],
    });
    expect(accounts.some((a) => a.igUsername === "already-tracked")).toBe(false);
  });

  it("orders suggestions by follower count, biggest accounts first", async () => {
    const { accounts, fallback } = await suggestedAccounts(realEstateAdmin(), {
      nicheSlug: "real estate",
      excludeUsernames: ["already-tracked"],
    });
    expect(fallback).toBe(false);
    // Followers desc: baseline (1M) leads outlier (5k), regardless of viral
    // outperformance — the "who to follow in your niche" ordering.
    expect(accounts.map((a) => a.igUsername)).toEqual(["baseline", "outlier"]);
    expect(accounts[0].followers).toBe(1_000_000);
  });

  it("falls back to ALL_NICHES ONLY for a user with no niche set", async () => {
    const admin = fakeAdmin({
      account_groups: [],
      inspiration_accounts: [{ user_id: "u1", ig_username: "solo", group_id: null }],
      ig_account_snapshots: [
        { ig_username: "solo", followers_count: 10_000, display_name: "Solo", avatar_url: null },
      ],
      ig_reel_snapshots: [
        {
          ig_username: "solo",
          ig_media_id: "s1",
          permalink: "p",
          caption: "c",
          thumbnail_url: "t",
          view_count: 50_000,
          like_count: 2_000,
          comment_count: 100,
          posted_at: iso(1),
        },
      ],
    });

    const { accounts, fallback } = await suggestedAccounts(admin, {
      nicheSlug: null,
      excludeUsernames: [],
    });
    expect(fallback).toBe(true);
    expect(accounts).toHaveLength(1);
    expect(accounts[0].igUsername).toBe("solo");
  });

  it("never shows off-niche accounts to a user WITH a niche — empty 'no-data', not ALL_NICHES", async () => {
    // A fitness creator must not be shown the platform-wide pool (e.g. AI/dev
    // accounts) just because their own niche has no data yet. Better an honest
    // "gathering accounts" empty state than a misleading cross-niche list.
    const admin = fakeAdmin({
      account_groups: [],
      inspiration_accounts: [{ user_id: "u1", ig_username: "solo", group_id: null }],
      ig_account_snapshots: [
        { ig_username: "solo", followers_count: 10_000, display_name: "Solo", avatar_url: null },
      ],
      ig_reel_snapshots: [
        {
          ig_username: "solo",
          ig_media_id: "s1",
          permalink: "p",
          caption: "c",
          thumbnail_url: "t",
          view_count: 50_000,
          like_count: 2_000,
          comment_count: 100,
          posted_at: iso(1),
        },
      ],
    });

    const { accounts, fallback, emptyReason } = await suggestedAccounts(admin, {
      nicheSlug: "ghost-niche",
      excludeUsernames: [],
    });
    expect(fallback).toBe(false);
    expect(accounts).toEqual([]);
    expect(emptyReason).toBe("no-data");
  });

  it("returns an empty, non-fallback result when there is no data anywhere", async () => {
    const admin = fakeAdmin({ account_groups: [], inspiration_accounts: [] });
    const { accounts, emptyReason } = await suggestedAccounts(admin, { nicheSlug: null, excludeUsernames: [] });
    expect(accounts).toEqual([]);
    expect(emptyReason).toBe("no-data");
  });

  it("flags emptyReason 'all-tracked' when the pool exists but the user already tracks all of it", async () => {
    const { accounts, emptyReason } = await suggestedAccounts(realEstateAdmin(), {
      nicheSlug: "real estate",
      excludeUsernames: ["outlier", "baseline", "already-tracked"],
    });
    expect(accounts).toEqual([]);
    expect(emptyReason).toBe("all-tracked");
  });

  // Cold-start seed pool: no cross-user data for the niche, but seed_accounts has
  // curated handles with cached reels. Fixture has NO account_groups /
  // inspiration_accounts, so nicheTrending returns [] and the seed tier fires.
  function seedOnlyAdmin() {
    return fakeAdmin({
      account_groups: [],
      inspiration_accounts: [],
      seed_accounts: [{ ig_username: "seeded", niche_slug: "fitness", priority: 1 }],
      ig_account_snapshots: [
        { ig_username: "seeded", followers_count: 20_000, display_name: "Seeded", avatar_url: null },
      ],
      ig_reel_snapshots: [
        {
          ig_username: "seeded",
          ig_media_id: "sd1",
          permalink: "p",
          caption: "c",
          thumbnail_url: "t",
          view_count: 120_000,
          like_count: 6_000,
          comment_count: 300,
          posted_at: iso(1),
        },
      ],
    });
  }

  it("falls back to the seed pool (niche-relevant, NOT flagged as fallback) when the niche has no cross-user data", async () => {
    const { accounts, fallback } = await suggestedAccounts(seedOnlyAdmin(), {
      nicheSlug: "fitness",
      excludeUsernames: [],
    });
    // Still the user's own niche, so fallback stays false (unlike ALL_NICHES).
    expect(fallback).toBe(false);
    expect(accounts).toHaveLength(1);
    expect(accounts[0].igUsername).toBe("seeded");
  });

  it("still excludes already-tracked handles from the seed pool", async () => {
    const { accounts, emptyReason } = await suggestedAccounts(seedOnlyAdmin(), {
      nicheSlug: "fitness",
      excludeUsernames: ["seeded"],
    });
    expect(accounts).toEqual([]);
    expect(emptyReason).toBe("all-tracked");
  });

  it("prefers the cross-user pool over the seed pool when both exist", async () => {
    // realEstateAdmin has cross-user data; seed_accounts is present but for a
    // handle with no reels, so it can only surface if the seed tier is (wrongly)
    // reached. The cross-user outlier must win and fallback stays false.
    const admin = fakeAdmin({
      account_groups: [{ id: "g1", name: "Real Estate" }],
      inspiration_accounts: [
        { user_id: "u1", ig_username: "outlier", group_id: "g1" },
        { user_id: "u2", ig_username: "baseline", group_id: "g1" },
      ],
      seed_accounts: [{ ig_username: "seedonly", niche_slug: "real estate", priority: 1 }],
      ig_account_snapshots: [
        { ig_username: "outlier", followers_count: 5_000, display_name: "Outlier", avatar_url: null },
        { ig_username: "baseline", followers_count: 1_000_000, display_name: "Baseline", avatar_url: null },
      ],
      ig_reel_snapshots: REEL_SNAPSHOTS.filter((r) => r.ig_username !== "already-tracked"),
    });
    const { accounts, fallback } = await suggestedAccounts(admin, {
      nicheSlug: "real estate",
      excludeUsernames: [],
    });
    expect(fallback).toBe(false);
    // Cross-user accounts (ordered followers desc: baseline then outlier); the
    // seed-only handle never surfaces because the cross-user pool wasn't empty.
    expect(accounts.map((a) => a.igUsername)).toEqual(["baseline", "outlier"]);
    expect(accounts.some((a) => a.igUsername === "seedonly")).toBe(false);
  });
});
