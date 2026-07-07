import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveNicheSlug, suggestedAccounts, discoverSeedAccounts } from "@/lib/suggestions/accounts";
import { SEED_ACCOUNTS_BY_NICHE, SEED_ACCOUNTS_FALLBACK } from "@/lib/suggestions/seed-accounts";
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

  it("ranks the size-controlled outlier above the big baseline account", async () => {
    const { accounts, fallback } = await suggestedAccounts(realEstateAdmin(), {
      nicheSlug: "real estate",
      excludeUsernames: ["already-tracked"],
    });
    expect(fallback).toBe(false);
    expect(accounts[0].igUsername).toBe("outlier");
    expect(accounts[0].topReel?.outperformRatio).toBeGreaterThan(1.5);
  });

  it("falls back to ALL_NICHES and flags it when the niche has no data", async () => {
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
      nicheSlug: "ghost-niche",
      excludeUsernames: [],
    });
    expect(fallback).toBe(true);
    expect(accounts).toHaveLength(1);
    expect(accounts[0].igUsername).toBe("solo");
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
});

describe("discoverSeedAccounts", () => {
  it("returns the curated list for an exact niche match, excluding already-tracked handles", async () => {
    const niche = "software engineering";
    const seedHandles = SEED_ACCOUNTS_BY_NICHE[niche];
    const excluded = seedHandles[0];

    const accounts = await discoverSeedAccounts(fakeAdmin({ ig_account_snapshots: [] }), {
      nicheSlug: niche,
      excludeUsernames: [excluded],
    });

    expect(accounts.some((a) => a.igUsername === excluded)).toBe(false);
    expect(accounts.length).toBeGreaterThan(0);
    expect(accounts.every((a) => seedHandles.includes(a.igUsername) || SEED_ACCOUNTS_FALLBACK.includes(a.igUsername))).toBe(
      true
    );
  });

  it("falls back to the generic list for an unrecognized niche", async () => {
    const accounts = await discoverSeedAccounts(fakeAdmin({ ig_account_snapshots: [] }), {
      nicheSlug: "underwater basket weaving",
      excludeUsernames: [],
    });

    expect(accounts.map((a) => a.igUsername)).toEqual(SEED_ACCOUNTS_FALLBACK.slice(0, accounts.length));
  });

  it("returns an empty list once every candidate (niche + fallback) is excluded", async () => {
    const niche = "memes";
    const excludeUsernames = [...SEED_ACCOUNTS_BY_NICHE[niche], ...SEED_ACCOUNTS_FALLBACK];

    const accounts = await discoverSeedAccounts(fakeAdmin({ ig_account_snapshots: [] }), {
      nicheSlug: niche,
      excludeUsernames,
    });

    expect(accounts).toEqual([]);
  });
});
