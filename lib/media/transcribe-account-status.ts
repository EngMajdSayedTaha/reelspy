// Per-account view of bulk transcription progress, read by the accounts page
// (server render) and by /api/ig/transcribe-account (polling), from one place so
// the two can't disagree about what a card should say.
//
// There is deliberately no progress table. `tracked_reels.transcript_status`
// already records, per reel, exactly what a bulk run changes, so progress is a
// count over rows the feature was going to write anyway. A separate counter
// would be a second source of truth that drifts the first time a reel is
// transcribed by the manual button, deleted, or discarded mid-run.
//
// The `jobs` table is RLS-locked service-role state, so this takes an admin
// client and does the per-user scoping itself.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type TranscribeRunState =
  | "idle" // never run, or finished with nothing left to do
  | "queued" // job accepted, not yet picked up
  | "running" // a chunk is in flight
  | "paused" // deferred: throttled or monthly quota spent — resumes on its own
  | "failed"; // the job exhausted its attempts

export type TranscribeAccountStatus = {
  accountId: string;
  state: TranscribeRunState;
  /** Reels eligible for transcription (not discarded). */
  total: number;
  /** Reels with a transcript already. */
  ready: number;
  /** Reels a run gave up on (no audio, removed, permanently private). */
  failed: number;
  /** Reels still waiting for one. */
  remaining: number;
  /** Why a paused/failed run is not progressing, when the job recorded a reason. */
  note: string | null;
};

// Dedup key for an account's bulk run. One active run per account: a second
// click while one is in flight is a no-op rather than a duplicate walk over the
// same reels.
export function transcribeAccountDedupKey(accountId: string): string {
  return `transcribe-account:${accountId}`;
}

type JobRow = {
  status: string;
  run_at: string;
  last_error: string | null;
};

// Which of this user's accounts have a bulk run in flight, in ONE query for the
// whole accounts grid.
//
// Deliberately not the full per-account progress: that costs three count queries
// per account, which is fine for the one card being polled and absurd for a grid
// of fifty. A card only needs to know whether to start polling; the numbers
// arrive with the first poll.
export async function readActiveTranscribeAccounts(
  admin: SupabaseClient,
  userId: string
): Promise<Set<string>> {
  const { data, error } = await admin
    .from("jobs")
    .select("payload")
    .eq("kind", "transcribe_account")
    .eq("user_id", userId)
    .in("status", ["queued", "running"]);

  if (error) throw new Error(`active transcribe runs unreadable: ${error.message}`);

  const ids = new Set<string>();
  for (const row of data ?? []) {
    const accountId = (row.payload as { account_id?: unknown } | null)?.account_id;
    if (typeof accountId === "string" && accountId) ids.add(accountId);
  }
  return ids;
}

export async function readTranscribeAccountStatus(
  admin: SupabaseClient,
  userId: string,
  accountId: string
): Promise<TranscribeAccountStatus> {
  const base = () =>
    admin
      .from("tracked_reels")
      .select("id", { head: true, count: "exact" })
      .eq("user_id", userId)
      .eq("account_id", accountId)
      .eq("is_discarded", false);

  const [total, ready, failed, job] = await Promise.all([
    base(),
    base().eq("transcript_status", "ready"),
    base().eq("transcript_status", "failed"),
    admin
      .from("jobs")
      .select("status, run_at, last_error")
      .eq("kind", "transcribe_account")
      .eq("dedup_key", transcribeAccountDedupKey(accountId))
      .eq("user_id", userId)
      .in("status", ["queued", "running", "failed"])
      // Newest first: a finished run leaves history behind, and only the current
      // one describes what the card should say.
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const totalCount = total.count ?? 0;
  const readyCount = ready.count ?? 0;
  const failedCount = failed.count ?? 0;
  // `pending` rows (a chunk mid-flight) are neither ready nor failed, so they
  // belong to "remaining" — the work is still outstanding.
  const remaining = Math.max(0, totalCount - readyCount - failedCount);

  const row = (job.data as JobRow | null) ?? null;

  let state: TranscribeRunState = "idle";
  let note: string | null = null;

  if (row) {
    note = row.last_error;
    if (row.status === "failed") {
      state = "failed";
    } else if (row.status === "running") {
      state = "running";
    } else {
      // Queued. A run_at in the future means it was deferred rather than simply
      // not picked up yet — that's the difference between "starting" and
      // "waiting for your quota to reset", and the user needs to see which.
      state = new Date(row.run_at).getTime() > Date.now() ? "paused" : "queued";
    }
  }

  return {
    accountId,
    state,
    total: totalCount,
    ready: readyCount,
    failed: failedCount,
    remaining,
    note,
  };
}
