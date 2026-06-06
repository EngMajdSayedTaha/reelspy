import { redirect } from "next/navigation";
import { ReelFeed } from "@/components/reels/ReelFeed";
import { FeedControls } from "@/components/reels/FeedControls";
import { FeedPagination } from "@/components/reels/FeedPagination";
import { SyncButton } from "@/components/reels/SyncButton";
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
  inspiration_accounts:
    | { ig_username: string; display_name: string | null; avatar_url: string | null }
    | { ig_username: string; display_name: string | null; avatar_url: string | null }[]
    | null;
};

const PER_PAGE = 12;

// Non-existent UUID used to force an empty result set for an empty group.
const NO_MATCH_ID = "00000000-0000-0000-0000-000000000000";

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
  const status = first(params.status) ?? "all";
  const q = (first(params.q) ?? "").trim();
  const sort = first(params.sort) ?? "recent";
  const order = first(params.order) === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number.parseInt(first(params.page) ?? "1", 10) || 1);

  const sortColumn = SORT_COLUMNS[sort] ?? "posted_at";
  const ascending = order === "asc";

  // Accounts for the filter dropdown.
  const { data: accountRows } = await supabase
    .from("inspiration_accounts")
    .select("id, ig_username")
    .eq("user_id", user.id)
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
      "id, caption, ig_permalink, thumbnail_url, view_count, like_count, comment_count, viral_score, is_worked_on, posted_at, transcript_status, inspiration_accounts(ig_username, display_name, avatar_url)",
      { count: "exact" }
    )
    .eq("user_id", user.id);

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

  const hasFilters = account !== "all" || group !== "all" || status !== "all" || q !== "";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-white">Feed</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Watch tracked reels inline, score performance, and turn the best ideas into scripts.
          </p>
        </div>

        <SyncButton />
      </div>

      <FeedControls
        accounts={accounts}
        groups={groups}
        current={{ account, group, status, q, sort, order }}
        total={total}
      />

      <ReelFeed reels={reels} markWorkedAction={markReelAsWorkedOn} hasFilters={hasFilters} />

      <FeedPagination page={page} totalPages={totalPages} total={total} perPage={PER_PAGE} />
    </div>
  );
}
