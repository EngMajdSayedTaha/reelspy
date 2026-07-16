// Cross-user niche intelligence (roadmap X3 — the durable moat). Aggregates the
// GLOBAL shared snapshot cache (ig_reel_snapshots / ig_account_snapshots) across
// EVERY user's tracked accounts to surface "what over-performs in niche X right
// now" — anonymized and size-controlled. Per-user data isn't a moat; this
// aggregate is.
//
// Service-role only. It intentionally crosses user boundaries (that's the whole
// point), so it reads via the admin client — the snapshot cache is RLS
// service-role-only, and inspiration_accounts is per-user RLS. Callers must
// treat the output as anonymized aggregate: it NEVER exposes which user tracks
// what — only public accounts, public reel metrics, and cross-user counts.
//
// Niche taxonomy = normalized `account_groups.name` (how users explicitly file
// accounts). `niche_tags` exists in the schema but nothing populates it, so the
// group name is the real per-account category signal.
//
// No SQL RPC yet (no DDL this session): medians/ranking are computed in JS over a
// capped candidate set. Correct for current volume; a `security definer` RPC is
// the future optimization (cf. V5's outperforming_feed) when DDL is available.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ALL_NICHES,
  slugifyNiche,
  viralScore,
  type NicheSummary,
  type TrendReel,
} from "./shared";

// Re-export the client-safe API so server callers can keep importing from here.
export { ALL_NICHES, slugifyNiche, viralScore };
export type { NicheSummary, TrendReel };

type AccountGroupRow = { id: string; name: string };
type InspAccountRow = { user_id: string; ig_username: string; group_id: string | null };

// Fetch (account -> niche keys) and (niche -> accounts/taggers) by joining every
// user's grouped inspiration_accounts against account_groups. Bounded by
// users×accounts, so a plain scan is fine.
async function loadNicheIndex(admin: SupabaseClient): Promise<{
  accountsByNiche: Map<string, Set<string>>;
  taggersByNiche: Map<string, Set<string>>;
  allAccounts: Set<string>;
}> {
  const [{ data: groups }, { data: accounts }] = await Promise.all([
    admin.from("account_groups").select("id, name").returns<AccountGroupRow[]>(),
    admin
      .from("inspiration_accounts")
      .select("user_id, ig_username, group_id")
      .eq("is_active", true)
      .returns<InspAccountRow[]>(),
  ]);

  const groupName = new Map<string, string>();
  for (const g of groups ?? []) groupName.set(g.id, g.name);

  const accountsByNiche = new Map<string, Set<string>>();
  const taggersByNiche = new Map<string, Set<string>>();
  const allAccounts = new Set<string>();

  for (const a of accounts ?? []) {
    const username = a.ig_username?.toLowerCase();
    if (!username) continue;
    allAccounts.add(username);
    const name = a.group_id ? groupName.get(a.group_id) : undefined;
    if (!name) continue;
    const niche = slugifyNiche(name);
    if (!niche) continue;
    if (!accountsByNiche.has(niche)) accountsByNiche.set(niche, new Set());
    if (!taggersByNiche.has(niche)) taggersByNiche.set(niche, new Set());
    accountsByNiche.get(niche)!.add(username);
    taggersByNiche.get(niche)!.add(a.user_id);
  }

  return { accountsByNiche, taggersByNiche, allAccounts };
}

// The niches available for the picker — those with at least `minAccounts`
// distinct accounts, most-populated first.
export async function listNiches(
  admin: SupabaseClient,
  opts: { minAccounts?: number; limit?: number } = {}
): Promise<NicheSummary[]> {
  const minAccounts = opts.minAccounts ?? 2;
  const limit = opts.limit ?? 40;
  const { accountsByNiche, taggersByNiche } = await loadNicheIndex(admin);

  return [...accountsByNiche.entries()]
    .map(([niche, accts]) => ({
      niche,
      accountCount: accts.size,
      taggerCount: taggersByNiche.get(niche)?.size ?? 0,
    }))
    .filter((n) => n.accountCount >= minAccounts)
    .sort((a, b) => b.accountCount - a.accountCount || b.taggerCount - a.taggerCount)
    .slice(0, limit);
}

type ReelSnapRow = {
  ig_username: string;
  ig_media_id: string;
  permalink: string | null;
  caption: string | null;
  thumbnail_url: string | null;
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  posted_at: string | null;
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Rank a fixed set of accounts' reels by audience-normalized score. Shared by
// nicheTrending (cross-user niche pool) and seedTrending (cold-start seed pool)
// so both use identical ranking math — per-account median baseline, then
// outperform/relative score. Pure aggregation over the global snapshot cache; no
// Graph calls.
export async function rankUsernameReels(
  admin: SupabaseClient,
  usernames: string[],
  opts: { days?: number; limit?: number } = {}
): Promise<TrendReel[]> {
  const days = opts.days ?? 14;
  const limit = opts.limit ?? 24;
  if (usernames.length === 0) return [];

  const sinceIso = new Date(Date.now() - days * 86_400_000).toISOString();

  // Reel snapshots for the accounts within the window, plus follower counts.
  // `.in()` is chunked to stay under URL/row limits.
  const reels: ReelSnapRow[] = [];
  const followers = new Map<string, number | null>();
  const CHUNK = 100;
  for (let i = 0; i < usernames.length; i += CHUNK) {
    const batch = usernames.slice(i, i + CHUNK);
    const [{ data: rs }, { data: as }] = await Promise.all([
      admin
        .from("ig_reel_snapshots")
        .select(
          "ig_username, ig_media_id, permalink, caption, thumbnail_url, view_count, like_count, comment_count, posted_at"
        )
        .in("ig_username", batch)
        .gte("posted_at", sinceIso)
        .returns<ReelSnapRow[]>(),
      admin
        .from("ig_account_snapshots")
        .select("ig_username, followers_count")
        .in("ig_username", batch)
        .returns<{ ig_username: string; followers_count: number | null }[]>(),
    ]);
    if (rs) reels.push(...rs);
    for (const a of as ?? []) followers.set(a.ig_username.toLowerCase(), a.followers_count);
  }
  if (reels.length === 0) return [];

  // Per-account median score (size-control baseline).
  const scoresByAccount = new Map<string, number[]>();
  for (const r of reels) {
    const s = viralScore(r.like_count ?? 0, r.comment_count ?? 0, r.view_count ?? 0);
    const key = r.ig_username.toLowerCase();
    if (!scoresByAccount.has(key)) scoresByAccount.set(key, []);
    scoresByAccount.get(key)!.push(s);
  }
  const medianByAccount = new Map<string, number>();
  for (const [key, scores] of scoresByAccount) medianByAccount.set(key, median(scores));

  return reels
    .map((r) => {
      const key = r.ig_username.toLowerCase();
      const score = viralScore(r.like_count ?? 0, r.comment_count ?? 0, r.view_count ?? 0);
      const med = medianByAccount.get(key) ?? 0;
      const fol = followers.get(key) ?? null;
      return {
        igUsername: r.ig_username,
        followers: fol,
        permalink: r.permalink,
        caption: r.caption,
        thumbnailUrl: r.thumbnail_url,
        viewCount: r.view_count ?? 0,
        likeCount: r.like_count ?? 0,
        commentCount: r.comment_count ?? 0,
        postedAt: r.posted_at,
        score,
        outperformRatio: med > 0 ? score / med : 1,
        relativeScore: score / Math.max(fol ?? 0, 1000),
      };
    })
    .sort((a, b) => b.relativeScore - a.relativeScore)
    .slice(0, limit);
}

// The moat query: top over-performing reels for a niche (or ALL_NICHES = the
// whole userbase's tracked set), ranked by audience-normalized score.
export async function nicheTrending(
  admin: SupabaseClient,
  opts: { niche?: string; days?: number; limit?: number; maxAccounts?: number } = {}
): Promise<TrendReel[]> {
  const niche = opts.niche && opts.niche !== ALL_NICHES ? slugifyNiche(opts.niche) : ALL_NICHES;
  const maxAccounts = opts.maxAccounts ?? 500;

  const { accountsByNiche, allAccounts } = await loadNicheIndex(admin);
  const usernames = [
    ...(niche === ALL_NICHES ? allAccounts : accountsByNiche.get(niche) ?? new Set<string>()),
  ].slice(0, maxAccounts);

  return rankUsernameReels(admin, usernames, { days: opts.days, limit: opts.limit });
}

type SeedAccountRow = { ig_username: string };

export type SeedAccountEntry = { ig_username: string; niche_slug: string };

// Page through EVERY seed_accounts row. seed_accounts is a large curated table
// (2k+ handles across 100+ niches) that exceeds PostgREST's default 1000-row
// response cap, so an unpaged `.select()` silently returns only the first ~1000
// physical rows — dropping whole niches (e.g. "real estate") from both niche
// resolution (listSeedNiches) and enrichment (enrichSeedAccounts). Both bugs
// left a real-estate creator with a null niche_slug ("Set your niche" forever)
// and off-niche fallback suggestions. Ordering by the primary key keeps paging
// stable (no skipped/duplicated rows across pages).
export async function loadAllSeedAccounts(admin: SupabaseClient): Promise<SeedAccountEntry[]> {
  const PAGE = 1000; // mirrors Supabase's default db-max-rows cap
  const out: SeedAccountEntry[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await admin
      .from("seed_accounts")
      .select("ig_username, niche_slug")
      .order("ig_username", { ascending: true })
      .range(from, from + PAGE - 1)
      .returns<SeedAccountEntry[]>();
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

// Cold-start seed pool for a niche (seed_accounts table). Same ranking math as
// nicheTrending but over a CURATED per-niche handle list instead of cross-user
// tracked accounts — used only as a suggestion fallback when the real niche pool
// is empty (lib/suggestions/accounts.ts). Deliberately NOT merged into
// nicheTrending / listNiches, so it never contaminates the cross-user aggregate.
export async function seedTrending(
  admin: SupabaseClient,
  opts: { niche: string; days?: number; limit?: number; maxAccounts?: number }
): Promise<TrendReel[]> {
  const niche = slugifyNiche(opts.niche);
  if (!niche || niche === ALL_NICHES) return [];
  const maxAccounts = opts.maxAccounts ?? 500;

  const { data } = await admin
    .from("seed_accounts")
    .select("ig_username")
    .eq("niche_slug", niche)
    .order("priority", { ascending: false })
    .limit(maxAccounts)
    .returns<SeedAccountRow[]>();

  const usernames = (data ?? []).map((r) => r.ig_username.toLowerCase());
  return rankUsernameReels(admin, usernames, { days: opts.days, limit: opts.limit });
}

// Distinct niche slugs that have seed data, shaped as NicheSummary so it unions
// cleanly with listNiches() output. Used to make seeded niches resolvable in the
// quiz on a fresh deploy (app/dashboard/onboarding/actions.ts). Kept a SEPARATE
// call from listNiches so seed niches never leak into the cross-user Niche Radar.
export async function listSeedNiches(admin: SupabaseClient): Promise<NicheSummary[]> {
  // Paged read — an unpaged select hits the 1000-row cap and drops niches whose
  // handles sit past the first page (that's what left "real estate" unresolvable).
  const rows = await loadAllSeedAccounts(admin);

  const counts = new Map<string, number>();
  for (const r of rows) {
    const niche = slugifyNiche(r.niche_slug);
    if (!niche) continue;
    counts.set(niche, (counts.get(niche) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([niche, accountCount]) => ({ niche, accountCount, taggerCount: 0 }))
    .sort((a, b) => b.accountCount - a.accountCount);
}
