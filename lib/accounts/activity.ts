// "Everything I did on this account" — the dossier's activity timeline.
//
// `app_events.props` carries no account id historically (and `feed_synced`
// carries no account identifier at all), so a timeline built purely on
// `app_events` would be sparse and wrong. This derives from what IS keyed to the
// account — the reel rows' own audit columns, the archive request ledger, and
// job rows whose payload names the account — and treats `app_events` as a bonus
// layer that gets richer as the new instrumentation accrues.
//
// Everything here goes through the service-role client (`jobs`, `app_events` and
// the archive tables all have RLS enabled with no policies) and does its own
// `user_id` scoping.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeUsername } from "@/lib/instagram/snapshots";

export type ActivityKind =
  | "account_tracked"
  | "reels_added"
  | "synced"
  | "sync_throttled"
  | "archive_requested"
  | "archive_completed"
  | "transcribe_started"
  | "transcribe_failed"
  | "transcripts_ready"
  | "reel_favorited"
  | "reel_worked"
  | "reel_discarded"
  | "script_generated"
  | "exported"
  | "paused"
  | "resumed"
  | "group_changed";

export type ActivityItem = {
  /** Stable dedupe key, `${kind}:${source}`. */
  id: string;
  at: string;
  kind: ActivityKind;
  /** Set on rolled-up day buckets — "1,847 reels added". */
  count?: number;
  reel?: { id: string; thumbnail_url: string | null; caption: string | null } | null;
  /** Group name, export format, error text — whatever the row carries. */
  label?: string | null;
};

/**
 * PostgREST's `or()` takes a comma-separated, parenthesised filter string, so a
 * value containing `,` `(` `)` or `.` would change the query's meaning rather
 * than be matched literally. `normalizeUsername` only lowercases and strips a
 * leading `@` — it does not constrain the charset, and `ig_username` is plain
 * text at the database level. Real Instagram handles are `[a-z0-9._]`, so
 * anything else is either junk or an injection attempt; both are safely handled
 * by dropping the username clause and matching on account_id alone.
 */
const SAFE_USERNAME = /^[a-z0-9._]+$/;

/** How far back the individually-listed reel events go. */
const REEL_EVENT_LIMIT = 6;
/** Timestamps pulled for day-bucketing. */
const BULK_LIMIT = 1000;
const EVENT_LIMIT = 60;
// A resumable bulk-transcription run inserts a new `jobs` row per chunk (one
// per quota-limited batch, one per resume after a pause) — the same run can
// leave a dozen rows behind in a single afternoon. Raised well past the old
// 12 so day-bucketing below has enough raw rows to actually collapse; the
// rendered output stays compact regardless, since bucketing is what shrinks it.
const JOB_LIMIT = 60;
/** Items returned; the client reveals the tail without another request. */
const MAX_ITEMS = 80;

type AccountRef = { id: string; ig_username: string; created_at: string | null };

export async function readAccountActivity(
  admin: SupabaseClient,
  userId: string,
  account: AccountRef
): Promise<ActivityItem[]> {
  const username = normalizeUsername(account.ig_username);

  const reelEvent = (column: string) =>
    admin
      .from("tracked_reels")
      .select(`id, thumbnail_url, caption, ${column}`)
      .eq("user_id", userId)
      .eq("account_id", account.id)
      .not(column, "is", null)
      .order(column, { ascending: false })
      .limit(REEL_EVENT_LIMIT);

  const [bulk, favorites, worked, discarded, archiveRequest, jobs, events] = await Promise.all([
    admin
      .from("tracked_reels")
      .select("created_at, transcript_generated_at")
      .eq("user_id", userId)
      .eq("account_id", account.id)
      .order("created_at", { ascending: false })
      .limit(BULK_LIMIT),
    reelEvent("favorited_at"),
    reelEvent("worked_on_at"),
    reelEvent("discarded_at"),
    admin
      .from("ig_account_archive_requests")
      .select("requested_at, materialized_at, reels_materialized")
      .eq("ig_username", username)
      .eq("user_id", userId)
      .maybeSingle(),
    admin
      .from("jobs")
      .select("id, kind, status, created_at, last_error")
      .eq("user_id", userId)
      .filter("payload->>account_id", "eq", account.id)
      .order("created_at", { ascending: false })
      .limit(JOB_LIMIT),
    // `username` is the legacy attribution path: events predating the
    // account_id instrumentation carry only the handle.
    (SAFE_USERNAME.test(username)
      ? admin
          .from("app_events")
          .select("id, event, props, created_at")
          .eq("user_id", userId)
          .or(`props->>account_id.eq.${account.id},props->>username.eq.${username}`)
      : admin
          .from("app_events")
          .select("id, event, props, created_at")
          .eq("user_id", userId)
          .filter("props->>account_id", "eq", account.id)
    )
      .order("created_at", { ascending: false })
      .limit(EVENT_LIMIT),
  ]);

  const items: ActivityItem[] = [];

  if (account.created_at) {
    items.push({ id: `account_tracked:${account.id}`, at: account.created_at, kind: "account_tracked" });
  }

  // An archive materializes thousands of rows within the same second. Listed
  // individually that is thousands of identical entries; bucketed by day it
  // reads "Jun 14 — 1,847 reels added".
  const bulkRows = (bulk.data ?? []) as {
    created_at: string | null;
    transcript_generated_at: string | null;
  }[];
  items.push(
    ...bucketByDay(
      bulkRows.map((r) => r.created_at),
      "reels_added"
    ),
    ...bucketByDay(
      bulkRows.map((r) => r.transcript_generated_at),
      "transcripts_ready"
    )
  );

  items.push(
    ...reelItems(favorites.data, "favorited_at", "reel_favorited"),
    ...reelItems(worked.data, "worked_on_at", "reel_worked"),
    ...reelItems(discarded.data, "discarded_at", "reel_discarded")
  );

  const request = archiveRequest.data as
    | { requested_at: string | null; materialized_at: string | null; reels_materialized: number | null }
    | null;
  if (request?.requested_at) {
    items.push({
      id: `archive_requested:${account.id}`,
      at: request.requested_at,
      kind: "archive_requested",
    });
  }
  if (request?.materialized_at) {
    items.push({
      id: `archive_completed:${account.id}`,
      at: request.materialized_at,
      kind: "archive_completed",
      count: request.reels_materialized ?? undefined,
    });
  }

  // A resumable bulk-transcription run leaves one `jobs` row per chunk — the
  // dedup key is constant for the account, but the queue still inserts a fresh
  // row every time it picks the run back up (after each quota-limited batch,
  // after every pause/resume). Listed individually that's a dozen identical
  // "Started transcribing every reel" entries an hour apart for what the user
  // experienced as clicking the button once. Bucketed by day it reads as one
  // line, same as the reel-row events above.
  //
  // Failures are kept individual and un-bucketed: they're rarer, each one is
  // independently actionable, and `last_error` differs row to row — collapsing
  // them would either drop that detail or need a "3 failures today, expand for
  // reasons" UI this timeline doesn't have.
  const transcribeJobs = (jobs.data ?? []) as {
    id: string;
    kind: string;
    status: string;
    created_at: string;
    last_error: string | null;
  }[];
  items.push(
    ...bucketByDay(
      transcribeJobs
        .filter((j) => j.kind === "transcribe_account" && j.status !== "failed")
        .map((j) => j.created_at),
      "transcribe_started"
    )
  );
  for (const job of transcribeJobs) {
    if (job.kind !== "transcribe_account" || job.status !== "failed") continue;
    items.push({
      id: `transcribe_failed:${job.id}`,
      at: job.created_at,
      kind: "transcribe_failed",
      label: job.last_error,
    });
  }

  for (const event of (events.data ?? []) as {
    id: number | string;
    event: string;
    props: Record<string, unknown> | null;
    created_at: string;
  }[]) {
    const kind = EVENT_KINDS[event.event];
    if (!kind) continue;
    items.push({
      id: `${kind}:event-${event.id}`,
      at: event.created_at,
      kind,
      label: eventLabel(event.event, event.props),
    });
  }

  return mergeActivity(items);
}

/**
 * Newest first, one entry per id, capped.
 *
 * Dedupe matters because a `jobs` row and an `app_events` row frequently
 * describe the same action — both are kept upstream because either can be
 * missing, and whichever arrives first here wins.
 *
 * Exported separately from the queries above so it can be tested directly:
 * ordering across sources with identical timestamps is the part that actually
 * has edge cases.
 */
export function mergeActivity(items: ActivityItem[], limit = MAX_ITEMS): ActivityItem[] {
  const seen = new Set<string>();
  return items
    .filter((item) => {
      if (!item.at || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    // ISO-8601 strings sort lexicographically, so this is a date comparison
    // without constructing 80 Date objects — but only because every producer
    // above emits UTC ISO strings.
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit);
}

const EVENT_KINDS: Record<string, ActivityKind> = {
  account_added: "account_tracked",
  feed_synced: "synced",
  sync_throttled: "sync_throttled",
  archive_requested: "archive_requested",
  archive_exported: "exported",
  transcribe_account_requested: "transcribe_started",
  script_generated: "script_generated",
  account_paused: "paused",
  account_resumed: "resumed",
  account_group_changed: "group_changed",
};

function eventLabel(event: string, props: Record<string, unknown> | null): string | null {
  if (!props) return null;
  if (event === "archive_exported") {
    const format = props.format;
    return typeof format === "string" ? format.toUpperCase() : null;
  }
  if (event === "account_group_changed") {
    const group = props.group;
    return typeof group === "string" ? group : null;
  }
  return null;
}

function reelItems(
  rows: unknown,
  column: string,
  kind: ActivityKind
): ActivityItem[] {
  return ((rows ?? []) as Record<string, unknown>[]).flatMap<ActivityItem>((row) => {
    const at = row[column];
    if (typeof at !== "string") return [];
    const caption = (row.caption as string | null) ?? null;
    return [
      {
        id: `${kind}:${row.id as string}`,
        at,
        kind,
        reel: {
          id: row.id as string,
          thumbnail_url: (row.thumbnail_url as string | null) ?? null,
          caption: caption ? caption.replace(/\s+/g, " ").slice(0, 90) : null,
        },
      },
    ];
  });
}

/**
 * Collapse a list of timestamps into one item per UTC day, stamped at the
 * newest timestamp in that day so ordering against un-bucketed items stays
 * correct.
 */
export function bucketByDay(
  timestamps: (string | null)[],
  kind: ActivityKind
): ActivityItem[] {
  const byDay = new Map<string, { count: number; newest: string }>();
  for (const ts of timestamps) {
    if (!ts) continue;
    const day = ts.slice(0, 10);
    const entry = byDay.get(day);
    if (entry) {
      entry.count += 1;
      if (ts > entry.newest) entry.newest = ts;
    } else {
      byDay.set(day, { count: 1, newest: ts });
    }
  }

  return Array.from(byDay.entries()).map(([day, { count, newest }]) => ({
    id: `${kind}:${day}`,
    at: newest,
    kind,
    count,
  }));
}
