import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ReelFeed } from "@/components/reels/ReelFeed";
import { FeedControls } from "@/components/reels/FeedControls";
import { FeedPagination } from "@/components/reels/FeedPagination";
import { SyncButton } from "@/components/reels/SyncButton";
import { RisingNow } from "@/components/reels/RisingNow";
import { createClient } from "@/lib/supabase/server";
import { PREFS_COOKIE, parsePrefs } from "@/lib/prefs";
import { numEnv } from "@/lib/utils/env";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { PageTourButton } from "@/components/tour/PageTourButton";
import { rankRising, risingSinceIso } from "@/lib/reels/ranking";
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
  // Set only on the "Outperforming" sort (W3/V5): how many times this reel beats
  // its own account's median reel. Drives the card's "Outperforming ×N" badge.
  outperform_ratio?: number | null;
  inspiration_accounts:
    | { ig_username: string; display_name: string | null; avatar_url: string | null }
    | { ig_username: string; display_name: string | null; avatar_url: string | null }[]
    | null;
};

// Flat row shape returned by the outperforming_feed RPC (W3/V5).
type OutperformRow = {
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
  ig_username: string;
  display_name: string | null;
  avatar_url: string | null;
  outperform_ratio: number | string | null;
  total_count: number | string;
};

function mapOutperformRow(row: OutperformRow): FeedReel {
  return {
    id: row.id,
    caption: row.caption,
    ig_permalink: row.ig_permalink,
    thumbnail_url: row.thumbnail_url,
    view_count: row.view_count,
    like_count: row.like_count,
    comment_count: row.comment_count,
    viral_score: row.viral_score,
    is_worked_on: row.is_worked_on,
    posted_at: row.posted_at,
    transcript_status: row.transcript_status,
    is_discarded: row.is_discarded,
    is_favorite: row.is_favorite,
    outperform_ratio: row.outperform_ratio != null ? Number(row.outperform_ratio) : null,
    inspiration_accounts: {
      ig_username: row.ig_username,
      display_name: row.display_name,
      avatar_url: row.avatar_url,
    },
  };
}

// Non-existent UUID used to force an empty result set for an empty group.
const NO_MATCH_ID = "00000000-0000-0000-0000-000000000000";

const RISING_LIMIT = 8;

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
  const dict = getDictionary(prefs.locale).feed;

  const account = first(params.account) ?? "all";
  const group = first(params.group) ?? "all";
  const status = first(params.status) ?? "new"; // default to New only
  const q = (first(params.q) ?? "").trim();
  // Default to "recent" so the newest reels lead the feed. Users can still opt
  // into the follower-normalized "Outperforming" ranking (W3/V5) — or any other
  // sort — from the feed controls.
  const sort = first(params.sort) ?? "recent";
  const order = first(params.order) === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number.parseInt(first(params.page) ?? "1", 10) || 1);
  // Explicit ?pp= wins, then the user's saved preference (Settings), then 10.
  const ppParam = first(params.pp);
  const perPage = ppParam === "25" ? 25 : ppParam === "10" ? 10 : prefs.feedPerPage;
  const risingGroup = first(params.rgroup) ?? "all";

  const sortColumn = SORT_COLUMNS[sort] ?? "posted_at";
  const ascending = order === "asc";

  // Accounts for the filter dropdown (active only) — also fed to SyncButton,
  // which needs last_synced_at to filter out already-fresh accounts client-side
  // before orchestrating its per-account sync.
  const { data: accountRows } = await supabase
    .from("inspiration_accounts")
    .select("id, ig_username, last_synced_at")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("ig_username", { ascending: true });

  const accounts = (accountRows ?? []) as { id: string; ig_username: string; last_synced_at: string | null }[];
  // Mirrors the server's own freshness window (app/api/ig/sync/route.ts) so
  // the client-side stale filter agrees with what a bulk sync would skip.
  const skipFreshSeconds = numEnv("SYNC_SKIP_FRESH_SECONDS", 1800);

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

  let reels: FeedReel[];
  let total: number;

  if (sort === "outperforming") {
    // Relative ranking lives in an RPC (a cross-table ratio can't be an ORDER BY
    // in a PostgREST select). It applies the same filters + pagination and
    // returns the outperform ratio per reel.
    const pGroupIds =
      group !== "all"
        ? groupAccountIds && groupAccountIds.length
          ? groupAccountIds
          : [NO_MATCH_ID]
        : null;

    const { data: rpcData, error: rpcError } = await supabase.rpc("outperforming_feed", {
      p_user_id: user.id,
      p_account: account !== "all" ? account : null,
      p_group_ids: pGroupIds,
      p_status: status,
      p_q: q || null,
      p_limit: perPage,
      p_offset: from,
    });

    if (rpcError) throw new Error(rpcError.message);

    const rows = (rpcData ?? []) as OutperformRow[];
    reels = rows.map(mapOutperformRow);
    total = rows.length > 0 ? Number(rows[0].total_count) : 0;
  } else {
    const { data, error, count } = await query
      .order(sortColumn, { ascending, nullsFirst: false })
      .range(from, to);

    if (error) {
      throw new Error(error.message);
    }

    reels = (data ?? []) as FeedReel[];
    total = count ?? 0;
  }

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
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">{dict.page.title}</h1>
            <PageTourButton page="feed" />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {dict.page.subtitle}
          </p>
        </div>

        <div data-tour="sync-button" className="flex flex-col items-end gap-2">
          <SyncButton accounts={accounts} skipFreshSeconds={skipFreshSeconds} />
        </div>
      </div>

      {showRising && (risingReels.length > 0 || risingGroup !== "all") ? (
        <div data-tour="rising-now">
          <RisingNow
            reels={risingReels}
            groups={groups}
            currentGroup={risingGroup}
            markWorkedAction={markReelAsWorkedOn}
            discardAction={setReelDiscarded}
            favoriteAction={setReelFavorited}
          />
        </div>
      ) : null}

      <div data-tour="feed-controls">
        <FeedControls
          accounts={accounts}
          groups={groups}
          current={{ account, group, status, q, sort, order, perPage: String(perPage) }}
          statusCounts={statusCounts}
          total={total}
        />
      </div>

      <div data-tour="reel-feed">
        <ReelFeed
          reels={reels}
          markWorkedAction={markReelAsWorkedOn}
          discardAction={setReelDiscarded}
          favoriteAction={setReelFavorited}
          hasFilters={hasFilters}
          hasAccounts={hasAccounts}
        />
      </div>

      <FeedPagination page={page} totalPages={totalPages} total={total} perPage={perPage} />
    </div>
  );
}
