import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ReelFeed } from "@/components/reels/ReelFeed";
import { FeedControls } from "@/components/reels/FeedControls";
import { FeedPagination } from "@/components/reels/FeedPagination";
import { SyncButton } from "@/components/reels/SyncButton";
import { RisingNow } from "@/components/reels/RisingNow";
import { createClient } from "@/lib/supabase/server";
import { PREFS_COOKIE, parsePrefs } from "@/lib/prefs";
import { markReelAsWorkedOn, setReelDiscarded, setReelFavorited } from "./actions";

export type FeedReel = {
  id: string;
  caption: string | null;
  ig_permalink: string;
  thumbnail_url: string | null;
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  viral_score: number | null;
  is_worked_on: boolean | null;
  posted_at: string | null;
  transcript_status: string | null;
  is_discarded: boolean | null;
  is_favorite: boolean | null;
  inspiration_accounts:
    | { ig_username: string; display_name: string | null; avatar_url: string | null }
    | { ig_username: string; display_name: string | null; avatar_url: string | null }[]
    | null;
};

// Non-existent UUID used to force an empty result set for an empty group.
const NO_MATCH_ID = "00000000-0000-0000-0000-000000000000";

const RISING_WINDOW_DAYS = 30;
const RISING_LIMIT = 8;

function risingSinceIso(): string {
  return new Date(Date.now() - RISING_WINDOW_DAYS * 24 * 3_600_000).toISOString();
}

// Ranks reels by engagement velocity (viral_score per hour since posting), so a
// fresh reel taking off outranks an older, already-viral one.
function rankRising(candidates: FeedReel[], limit: number): FeedReel[] {
  const now = Date.now();
  return candidates
    .map((reel) => {
      const posted = reel.posted_at ? new Date(reel.posted_at).getTime() : now;
      const ageHours = Math.max(0, (now - posted) / 3_600_000);
      const velocity = (reel.viral_score ?? 0) / (ageHours + 2);
      return { reel, velocity };
    })
    .filter((entry) => entry.velocity > 0)
    .sort((a, b) => b.velocity - a.velocity)
    .slice(0, limit)
    .map((entry) => entry.reel);
}

const SORT_COLUMNS: Record<string, string> = {
  recent: "posted_at",
  views: "view_count",
  likes: "like_count",
  comments: "comment_count",
  viral: "viral_score",
};

type SearchParams = {
  account?: string;
  group?: string;
  status?: string;
  q?: string;
  sort?: string;
  order?: string;
  page?: string;
  pp?: string;
  rgroup?: string;
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const params = await searchParams;
  const prefs = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);

  const account = first(params.account) ?? "all";
  const group = first(params.group) ?? "all";
  const status = first(params.status) ?? "new"; // default to New only
  const q = (first(params.q) ?? "").trim();
  const sort = first(params.sort) ?? "recent";
  const order = first(params.order) === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number.parseInt(first(params.page) ?? "1", 10) || 1);
  // Explicit ?pp= wins, then the user's saved preference (Settings), then 10.
  const ppParam = first(params.pp);
  const perPage = ppParam === "25" ? 25 : ppParam === "10" ? 10 : prefs.feedPerPage;
  const risingGroup = first(params.rgroup) ?? "all";

  const sortColumn = SORT_COLUMNS[sort] ?? "posted_at";
  const ascending = order === "asc";

  // Accounts for the filter dropdown (active only).
  const { data: accountRows } = await supabase
    .from("inspiration_accounts")
    .select("id, ig_username")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("ig_username", { ascending: true });

  const accounts = (accountRows ?? []) as { id: string; ig_username: string }[];

  // Does the user track any accounts at all (active or paused)? Drives the
  // first-run empty state, which routes to onboarding rather than telling a
  // brand-new user to "sync" something they haven't set up yet.
  const { count: accountsTotal } = await supabase
    .from("inspiration_accounts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  const hasAccounts = (accountsTotal ?? 0) > 0;

  // Groups for the filter dropdown.
  const { data: groupRows } = await supabase
    .from("account_groups")
    .select("id, name")
    .eq("user_id", user.id)
    .order("name", { ascending: true });

  const groups = (groupRows ?? []) as { id: string; name: string }[];

  // Resolve group → account ids once (reused by the main query and the counts).
  let groupAccountIds: string[] | null = null;
  if (group !== "all") {
    const { data: ga } = await supabase
      .from("inspiration_accounts")
      .select("id")
      .eq("user_id", user.id)
      .eq("group_id", group);
    groupAccountIds = (ga ?? []).map((a) => a.id);
  }

  // Build the filtered reels query (with exact count for pagination).
  let query = supabase
    .from("tracked_reels")
    .select(
      "id, caption, ig_permalink, thumbnail_url, view_count, like_count, comment_count, viral_score, is_worked_on, posted_at, transcript_status, is_discarded, is_favorite, inspiration_accounts!inner(ig_username, display_name, avatar_url)",
      { count: "exact" }
    )
    .eq("user_id", user.id)
    .eq("inspiration_accounts.is_active", true);

  if (account !== "all") {
    query = query.eq("account_id", account);
  }

  if (group !== "all") {
    // Empty group → no matching reels (sentinel keeps the query valid).
    const ids = groupAccountIds && groupAccountIds.length ? groupAccountIds : [NO_MATCH_ID];
    query = query.in("account_id", ids);
  }

  if (status === "discarded") {
    query = query.eq("is_discarded", true);
  } else {
    // Discarded reels are hidden from every other view.
    query = query.eq("is_discarded", false);
    if (status === "new") {
      query = query.eq("is_worked_on", false);
    } else if (status === "worked") {
      query = query.eq("is_worked_on", true);
    } else if (status === "favorites") {
      query = query.eq("is_favorite", true);
    }
  }

  if (q) {
    query = query.ilike("caption", `%${q}%`);
  }

  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  const { data, error, count } = await query
    .order(sortColumn, { ascending, nullsFirst: false })
    .range(from, to);

  if (error) {
    throw new Error(error.message);
  }

  const reels = (data ?? []) as FeedReel[];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  // Account/group/search filters (status excluded — its default is "new").
  const hasContentFilters =
    account !== "all" || group !== "all" || q !== "";
  const hasFilters = hasContentFilters || status !== "new";

  // Status counts (respecting the account/group/search filters) for the
  // filter badges.
  const countBase = () => {
    let qy = supabase
      .from("tracked_reels")
      .select("id, inspiration_accounts!inner(id)", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("inspiration_accounts.is_active", true);
    if (account !== "all") qy = qy.eq("account_id", account);
    if (group !== "all") {
      const ids = groupAccountIds && groupAccountIds.length ? groupAccountIds : [NO_MATCH_ID];
      qy = qy.in("account_id", ids);
    }
    if (q) qy = qy.ilike("caption", `%${q}%`);
    return qy;
  };

  const [cAll, cNew, cWorked, cFav, cDisc] = await Promise.all([
    countBase().eq("is_discarded", false),
    countBase().eq("is_discarded", false).eq("is_worked_on", false),
    countBase().eq("is_discarded", false).eq("is_worked_on", true),
    countBase().eq("is_discarded", false).eq("is_favorite", true),
    countBase().eq("is_discarded", true),
  ]);

  const statusCounts = {
    all: cAll.count ?? 0,
    new: cNew.count ?? 0,
    worked: cWorked.count ?? 0,
    favorites: cFav.count ?? 0,
    discarded: cDisc.count ?? 0,
  };

  // "Rising now" rail — only on the unfiltered first page. Has its own group
  // scope (rgroup), independent of the main feed filters. Reels are pulled
  // recent and ranked by velocity in JS (no time-dependent SQL needed).
  const showRising = !hasContentFilters && page === 1;
  let risingReels: FeedReel[] = [];
  if (showRising) {
    const since = risingSinceIso();
    let recentQuery = supabase
      .from("tracked_reels")
      .select(
        "id, caption, ig_permalink, thumbnail_url, view_count, like_count, comment_count, viral_score, is_worked_on, posted_at, transcript_status, is_discarded, is_favorite, inspiration_accounts!inner(ig_username, display_name, avatar_url)"
      )
      .eq("user_id", user.id)
      .eq("inspiration_accounts.is_active", true)
      .eq("is_discarded", false)
      // Already worked-on reels are done — the rail is for fresh opportunities.
      .eq("is_worked_on", false)
      .gte("posted_at", since);

    if (risingGroup !== "all") {
      const { data: risingGroupAccounts } = await supabase
        .from("inspiration_accounts")
        .select("id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .eq("group_id", risingGroup);

      const ids = (risingGroupAccounts ?? []).map((a) => a.id);
      recentQuery = recentQuery.in("account_id", ids.length ? ids : [NO_MATCH_ID]);
    }

    const { data: recent } = await recentQuery
      .order("posted_at", { ascending: false })
      .limit(300);

    risingReels = rankRising((recent ?? []) as FeedReel[], RISING_LIMIT);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">Feed</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Watch tracked reels inline, score performance, and turn the best ideas into scripts.
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <SyncButton />
        </div>
      </div>

      {showRising && (risingReels.length > 0 || risingGroup !== "all") ? (
        <RisingNow
          reels={risingReels}
          groups={groups}
          currentGroup={risingGroup}
          markWorkedAction={markReelAsWorkedOn}
          discardAction={setReelDiscarded}
          favoriteAction={setReelFavorited}
        />
      ) : null}

      <FeedControls
        accounts={accounts}
        groups={groups}
        current={{ account, group, status, q, sort, order, perPage: String(perPage) }}
        statusCounts={statusCounts}
        total={total}
      />

      <ReelFeed
        reels={reels}
        markWorkedAction={markReelAsWorkedOn}
        discardAction={setReelDiscarded}
        favoriteAction={setReelFavorited}
        hasFilters={hasFilters}
        hasAccounts={hasAccounts}
      />

      <FeedPagination page={page} totalPages={totalPages} total={total} perPage={perPage} />
    </div>
  );
}
