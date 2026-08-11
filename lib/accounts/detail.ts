// Everything the account dossier at /dashboard/accounts/[id] needs, read in one
// place so the page component stays a layout.
//
// Two clients, deliberately:
//   * the caller's RLS client for anything owned by the user — the
//     `auth.uid() = user_id` policy IS the authorization check, which is why a
//     foreign account id comes back as `null` and becomes a 404;
//   * the service-role client for `ig_account_archives`, `jobs`,
//     `app_events` and `ig_account_metric_history`, which all have RLS enabled
//     with no policies at all.
//
// Both are parameters rather than constructed here, matching
// `readArchiveStatuses` / `readTranscribeAccountStatus`, so the module is
// fakeable under vitest.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readArchiveStatuses, type ArchiveStatus } from "@/lib/instagram/archive-status";
import {
  readTranscribeAccountStatus,
  type TranscribeAccountStatus,
} from "@/lib/media/transcribe-account-status";
import { normalizeUsername } from "@/lib/instagram/snapshots";
import { readAccountActivity, type ActivityItem } from "@/lib/accounts/activity";
import { cadenceSummary, reachSummary, type ReelPoint } from "@/lib/accounts/metrics";

/**
 * How many reels are pulled for the charts.
 *
 * A fully archived account can hold 2,000+ rows. Shipping all of them into the
 * RSC flight payload would be megabytes, and a 2,000-bar chart is unreadable
 * anyway — charts only ever need a window. Exact medians over the *full* set
 * come from the `account_insights` RPC instead, so the window never has to be
 * complete to be correct.
 */
export const REEL_WINDOW = 400;

export type AccountRow = {
  id: string;
  ig_username: string;
  display_name: string | null;
  avatar_url: string | null;
  followers_count: number | null;
  is_active: boolean | null;
  last_synced_at: string | null;
  created_at: string | null;
  group_id: string | null;
  group_name: string | null;
};

/** Exact, full-set aggregates. Mirrors the `account_insights` RPC row. */
export type AccountAggregates = {
  /** False when the numbers were derived from the window because the RPC is
   *  unavailable (migration not applied yet) — the UI says so rather than
   *  quietly presenting partial medians as complete ones. */
  exact: boolean;
  reelsTotal: number;
  reelsDiscarded: number;
  reelsFavorite: number;
  reelsWorked: number;
  viewsTotal: number;
  likesTotal: number;
  commentsTotal: number;
  viewsMedian: number | null;
  viewsAvg: number | null;
  viewsP90: number | null;
  viewsMax: number | null;
  firstPostedAt: string | null;
  lastPostedAt: string | null;
  firstTrackedAt: string | null;
  transcriptsReady: number;
  transcriptsFailed: number;
  transcriptsPending: number;
  scriptsGenerated: number;
  hooksSaved: number;
};

export type MetricHistoryPoint = { on: string; followers: number | null };

export type OutperformRow = {
  id: string;
  caption: string | null;
  thumbnail_url: string | null;
  ig_permalink: string | null;
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  posted_at: string | null;
  outperform_ratio: number | null;
};

export type AccountGroup = { id: string; name: string };

export type AccountDetail = {
  account: AccountRow;
  groups: AccountGroup[];
  aggregates: AccountAggregates;
  /** Bounded, newest-first. Never carries `transcript` / `transcript_srt`. */
  reels: ReelPoint[];
  archive: ArchiveStatus | null;
  transcribe: TranscribeAccountStatus | null;
  history: MetricHistoryPoint[];
  activity: ActivityItem[];
  outperformers: OutperformRow[];
  /** True when the service-role client was unavailable and the admin-scoped
   *  panels are therefore missing rather than empty. */
  degraded: boolean;
};

const REEL_COLUMNS =
  "id, view_count, like_count, comment_count, viral_score, posted_at, created_at, caption, thumbnail_url, ig_permalink, transcript_status, is_favorite, is_worked_on";

export async function readAccountDetail(
  supabase: SupabaseClient,
  admin: SupabaseClient | null,
  userId: string,
  accountId: string
): Promise<AccountDetail | null> {
  const { data: accountRow, error } = await supabase
    .from("inspiration_accounts")
    .select(
      "id, ig_username, display_name, avatar_url, followers_count, is_active, last_synced_at, created_at, group_id, account_groups(name)"
    )
    .eq("id", accountId)
    .eq("user_id", userId)
    .maybeSingle();

  // A malformed uuid makes PostgREST error rather than return no rows; both mean
  // "there is no such account for you", which the page turns into a 404.
  if (error || !accountRow) return null;

  const embedded = accountRow.account_groups as { name: string } | { name: string }[] | null;
  const account: AccountRow = {
    id: accountRow.id as string,
    ig_username: accountRow.ig_username as string,
    display_name: (accountRow.display_name as string | null) ?? null,
    avatar_url: (accountRow.avatar_url as string | null) ?? null,
    followers_count: (accountRow.followers_count as number | null) ?? null,
    is_active: (accountRow.is_active as boolean | null) ?? null,
    last_synced_at: (accountRow.last_synced_at as string | null) ?? null,
    created_at: (accountRow.created_at as string | null) ?? null,
    group_id: (accountRow.group_id as string | null) ?? null,
    group_name: Array.isArray(embedded) ? (embedded[0]?.name ?? null) : (embedded?.name ?? null),
  };

  const username = normalizeUsername(account.ig_username);

  const [reelsRes, groupsRes, rpcAggregates, outperformers] = await Promise.all([
    supabase
      .from("tracked_reels")
      .select(REEL_COLUMNS)
      .eq("user_id", userId)
      .eq("account_id", accountId)
      .eq("is_discarded", false)
      .order("posted_at", { ascending: false, nullsFirst: false })
      .limit(REEL_WINDOW),
    supabase
      .from("account_groups")
      .select("id, name")
      .eq("user_id", userId)
      .order("name", { ascending: true }),
    readAggregates(supabase, userId, accountId),
    readOutperformers(supabase, userId, accountId, account.is_active !== false),
  ]);

  const reels = (reelsRes.data ?? []) as ReelPoint[];
  const groups = (groupsRes.data ?? []) as AccountGroup[];

  // Everything below needs the service-role client. A missing key or an
  // unapplied migration must cost the user those panels, not the whole page —
  // same posture as the accounts grid.
  let archive: ArchiveStatus | null = null;
  let transcribe: TranscribeAccountStatus | null = null;
  let history: MetricHistoryPoint[] = [];
  let activity: ActivityItem[] = [];
  let degraded = admin == null;

  if (admin) {
    try {
      const [archives, transcribeStatus, historyRows, activityItems] = await Promise.all([
        readArchiveStatuses(admin, userId, [{ id: account.id, ig_username: account.ig_username }]),
        readTranscribeAccountStatus(admin, userId, accountId),
        readMetricHistory(admin, username),
        readAccountActivity(admin, userId, account),
      ]);
      archive = archives[0] ?? null;
      transcribe = transcribeStatus;
      history = historyRows;
      activity = activityItems;
    } catch (adminError) {
      degraded = true;
      console.warn(
        "[account-detail] admin-scoped panels unavailable:",
        adminError instanceof Error ? adminError.message : adminError
      );
    }
  }

  return {
    account,
    groups,
    aggregates: rpcAggregates ?? aggregatesFromWindow(reels),
    reels,
    archive,
    transcribe,
    history,
    activity,
    outperformers,
    degraded,
  };
}

/* ------------------------------------------------------------------ *
 * Aggregates
 * ------------------------------------------------------------------ */

type InsightsRpcRow = Record<string, unknown>;

const int = (v: unknown): number => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : 0;
  return Number.isFinite(n) ? n : 0;
};
const maybe = (v: unknown): number | null => {
  if (v == null) return null;
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

async function readAggregates(
  supabase: SupabaseClient,
  userId: string,
  accountId: string
): Promise<AccountAggregates | null> {
  // Tolerated failure: the migration adding this RPC may not be applied yet, in
  // which case the caller falls back to window-scoped numbers and the UI flags
  // them as approximate. A hard failure here would 404 a working page.
  const { data, error } = await supabase.rpc("account_insights", {
    p_user_id: userId,
    p_account_id: accountId,
  });

  if (error) return null;

  const row = (Array.isArray(data) ? data[0] : data) as InsightsRpcRow | null | undefined;
  if (!row) return null;

  return {
    exact: true,
    reelsTotal: int(row.reels_total),
    reelsDiscarded: int(row.reels_discarded),
    reelsFavorite: int(row.reels_favorite),
    reelsWorked: int(row.reels_worked),
    viewsTotal: int(row.views_total),
    likesTotal: int(row.likes_total),
    commentsTotal: int(row.comments_total),
    viewsMedian: maybe(row.views_median),
    viewsAvg: maybe(row.views_avg),
    viewsP90: maybe(row.views_p90),
    viewsMax: maybe(row.views_max),
    firstPostedAt: str(row.first_posted_at),
    lastPostedAt: str(row.last_posted_at),
    firstTrackedAt: str(row.first_tracked_at),
    transcriptsReady: int(row.transcripts_ready),
    transcriptsFailed: int(row.transcripts_failed),
    transcriptsPending: int(row.transcripts_pending),
    scriptsGenerated: int(row.scripts_generated),
    hooksSaved: int(row.hooks_saved),
  };
}

/** Window-scoped stand-in when the RPC is unavailable. */
function aggregatesFromWindow(reels: ReelPoint[]): AccountAggregates {
  const reach = reachSummary(reels);
  const cadence = cadenceSummary(reels);
  const status = (s: string) => reels.filter((r) => r.transcript_status === s).length;

  return {
    exact: false,
    reelsTotal: reach.count,
    reelsDiscarded: 0,
    reelsFavorite: reels.filter((r) => r.is_favorite).length,
    reelsWorked: reels.filter((r) => r.is_worked_on).length,
    viewsTotal: reach.totalViews,
    likesTotal: reach.totalLikes,
    commentsTotal: reach.totalComments,
    viewsMedian: reach.medianViews,
    viewsAvg: reach.meanViews,
    viewsP90: reach.p90Views,
    viewsMax: reach.maxViews,
    firstPostedAt: cadence.firstPostedAt,
    lastPostedAt: cadence.lastPostedAt,
    firstTrackedAt: null,
    transcriptsReady: status("ready"),
    transcriptsFailed: status("failed"),
    transcriptsPending: status("pending"),
    scriptsGenerated: 0,
    hooksSaved: 0,
  };
}

/* ------------------------------------------------------------------ *
 * Secondary reads
 * ------------------------------------------------------------------ */

async function readOutperformers(
  supabase: SupabaseClient,
  userId: string,
  accountId: string,
  isActive: boolean
): Promise<OutperformRow[]> {
  // The RPC inner-joins `is_active = true`, so a paused account would always
  // come back empty. Skip the round trip rather than render an empty section
  // that looks like "this account has no standout reels".
  if (!isActive) return [];

  const { data, error } = await supabase.rpc("outperforming_feed", {
    p_user_id: userId,
    p_account: accountId,
    p_group_ids: null,
    p_status: "all",
    p_q: null,
    p_limit: 6,
    p_offset: 0,
  });

  if (error) return [];
  return (data ?? []) as OutperformRow[];
}

async function readMetricHistory(
  admin: SupabaseClient,
  username: string
): Promise<MetricHistoryPoint[]> {
  // Tolerated failure for the same reason as the RPC: the table arrives with a
  // migration the running deployment may not have yet.
  const { data, error } = await admin
    .from("ig_account_metric_history")
    .select("captured_on, followers_count")
    .eq("ig_username", username)
    .order("captured_on", { ascending: true })
    .limit(365);

  if (error) return [];

  return (data ?? [])
    .map((row) => ({
      on: row.captured_on as string,
      followers: (row.followers_count as number | null) ?? null,
    }))
    // A missed cron day must draw a straight line between real points, never a
    // dip to zero — so gaps are dropped, not coalesced.
    .filter((p) => p.followers != null);
}
