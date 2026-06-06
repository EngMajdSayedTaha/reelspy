import { redirect } from "next/navigation";
import { ReelFeed } from "@/components/reels/ReelFeed";
import { FeedControls } from "@/components/reels/FeedControls";
import { FeedPagination } from "@/components/reels/FeedPagination";
import { SyncButton } from "@/components/reels/SyncButton";
import { RisingNow } from "@/components/reels/RisingNow";
import { PatternBackfill } from "@/components/reels/PatternBackfill";
import { createClient } from "@/lib/supabase/server";
import { markReelAsWorkedOn } from "./actions";

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
  viral_pattern: string | null;
  inspiration_accounts:
    | { ig_username: string; display_name: string | null; avatar_url: string | null }
    | { ig_username: string; display_name: string | null; avatar_url: string | null }[]
    | null;
};

const PER_PAGE = 12;

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
  pattern?: string;
  status?: string;
  q?: string;
  sort?: string;
  order?: string;
  page?: string;
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

  const account = first(params.account) ?? "all";
  const group = first(params.group) ?? "all";
  const pattern = first(params.pattern) ?? "all";
  const status = first(params.status) ?? "all";
  const q = (first(params.q) ?? "").trim();
  const sort = first(params.sort) ?? "recent";
  const order = first(params.order) === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number.parseInt(first(params.page) ?? "1", 10) || 1);
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

  // Groups for the filter dropdown.
  const { data: groupRows } = await supabase
    .from("account_groups")
    .select("id, name")
    .eq("user_id", user.id)
    .order("name", { ascending: true });

  const groups = (groupRows ?? []) as { id: string; name: string }[];

  // Build the filtered reels query (with exact count for pagination).
  let query = supabase
    .from("tracked_reels")
    .select(
      "id, caption, ig_permalink, thumbnail_url, view_count, like_count, comment_count, viral_score, is_worked_on, posted_at, transcript_status, viral_pattern, inspiration_accounts!inner(ig_username, display_name, avatar_url)",
      { count: "exact" }
    )
    .eq("user_id", user.id)
    .eq("inspiration_accounts.is_active", true);

  if (account !== "all") {
    query = query.eq("account_id", account);
  }

  if (group !== "all") {
    // Resolve the accounts in this group, then constrain reels to them.
    const { data: groupAccounts } = await supabase
      .from("inspiration_accounts")
      .select("id")
      .eq("user_id", user.id)
      .eq("group_id", group);

    const groupAccountIds = (groupAccounts ?? []).map((a) => a.id);
    // Empty group → no matching reels (sentinel keeps the query valid).
    query = query.in("account_id", groupAccountIds.length ? groupAccountIds : [NO_MATCH_ID]);
  }

  if (pattern !== "all") {
    query = query.eq("viral_pattern", pattern);
  }

  if (status === "new") {
    query = query.eq("is_worked_on", false);
  } else if (status === "worked") {
    query = query.eq("is_worked_on", true);
  }

  if (q) {
    query = query.ilike("caption", `%${q}%`);
  }

  const from = (page - 1) * PER_PAGE;
  const to = from + PER_PAGE - 1;

  const { data, error, count } = await query
    .order(sortColumn, { ascending, nullsFirst: false })
    .range(from, to);

  if (error) {
    throw new Error(error.message);
  }

  const reels = (data ?? []) as FeedReel[];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  const hasFilters =
    account !== "all" || group !== "all" || pattern !== "all" || status !== "all" || q !== "";

  // Reels still needing pattern classification (drives the tagging control).
  const { count: missingPatternCount } = await supabase
    .from("tracked_reels")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("viral_pattern", null)
    .is("pattern_checked_at", null);

  // "Rising now" rail — only on the unfiltered first page. Has its own group
  // scope (rgroup), independent of the main feed filters. Reels are pulled
  // recent and ranked by velocity in JS (no time-dependent SQL needed).
  const showRising = !hasFilters && page === 1;
  let risingReels: FeedReel[] = [];
  if (showRising) {
    const since = risingSinceIso();
    let recentQuery = supabase
      .from("tracked_reels")
      .select(
        "id, caption, ig_permalink, thumbnail_url, view_count, like_count, comment_count, viral_score, is_worked_on, posted_at, transcript_status, viral_pattern, inspiration_accounts!inner(ig_username, display_name, avatar_url)"
      )
      .eq("user_id", user.id)
      .eq("inspiration_accounts.is_active", true)
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
          <h1 className="text-3xl font-semibold tracking-tight text-white">Feed</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Watch tracked reels inline, score performance, and turn the best ideas into scripts.
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <SyncButton />
          <PatternBackfill initialMissing={missingPatternCount ?? 0} />
        </div>
      </div>

      {showRising && (risingReels.length > 0 || risingGroup !== "all") ? (
        <RisingNow
          reels={risingReels}
          groups={groups}
          currentGroup={risingGroup}
          markWorkedAction={markReelAsWorkedOn}
        />
      ) : null}

      <FeedControls
        accounts={accounts}
        groups={groups}
        current={{ account, group, pattern, status, q, sort, order }}
        total={total}
      />

      <ReelFeed reels={reels} markWorkedAction={markReelAsWorkedOn} hasFilters={hasFilters} />

      <FeedPagination page={page} totalPages={totalPages} total={total} perPage={PER_PAGE} />
    </div>
  );
}
