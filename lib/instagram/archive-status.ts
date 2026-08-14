// Per-user view of the full-history archives. Read by the accounts page (server
// render) and by /api/ig/archive (polling), from one place so the two can't
// disagree about what a card should say.
//
// The archive tables are RLS-locked global state, so this takes an admin client
// and does the per-user scoping itself.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeUsername } from "@/lib/instagram/snapshots";

export type ArchiveStatusValue = "queued" | "running" | "done" | "partial" | "failed";

export type ArchiveStatus = {
  accountId: string;
  username: string;
  /** Whether THIS user asked for an archive of this account. */
  requested: boolean;
  status: ArchiveStatusValue | null;
  reelsFound: number;
  pagesFetched: number;
  /** Oldest media the walk has reached — how far back the history now goes. */
  oldestSeenAt: string | null;
  /** The walk reached the account's first post; nothing deeper exists. */
  exhausted: boolean;
  materializedAt: string | null;
  reelsMaterialized: number;
  error: string | null;
};

export type ArchiveAccountRef = { id: string; ig_username: string };

export async function readArchiveStatuses(
  admin: SupabaseClient,
  userId: string,
  accounts: ArchiveAccountRef[]
): Promise<ArchiveStatus[]> {
  if (accounts.length === 0) return [];

  const unames = Array.from(new Set(accounts.map((a) => normalizeUsername(a.ig_username))));

  const [{ data: archives }, { data: requests }] = await Promise.all([
    admin
      .from("ig_account_archives")
      .select(
        "ig_username, status, exhausted, oldest_seen_at, reels_found, pages_fetched, last_error"
      )
      .in("ig_username", unames),
    admin
      .from("ig_account_archive_requests")
      .select("ig_username, since, materialized_at, reels_materialized")
      .eq("user_id", userId)
      .in("ig_username", unames),
  ]);

  const byName = new Map((archives ?? []).map((a) => [a.ig_username as string, a]));
  const requestByName = new Map((requests ?? []).map((r) => [r.ig_username as string, r]));

  return accounts.map((account) => {
    const username = normalizeUsername(account.ig_username);
    const archive = byName.get(username);
    const request = requestByName.get(username);

    // The shared cache may hold @nike's entire history because a different
    // customer paid to pull it. That is not this user's archive to see, so
    // everything below the `requested` flag is gated on their own request row.
    if (!request) {
      return {
        accountId: account.id,
        username,
        requested: false,
        status: null,
        reelsFound: 0,
        pagesFetched: 0,
        oldestSeenAt: null,
        exhausted: false,
        materializedAt: null,
        reelsMaterialized: 0,
        error: null,
      };
    }

    return {
      accountId: account.id,
      username,
      requested: true,
      // A request row with no archive row yet means the job hasn't started.
      status: (archive?.status as ArchiveStatusValue | undefined) ?? "queued",
      reelsFound: (archive?.reels_found as number | undefined) ?? 0,
      pagesFetched: (archive?.pages_fetched as number | undefined) ?? 0,
      oldestSeenAt: (archive?.oldest_seen_at as string | null | undefined) ?? null,
      exhausted: Boolean(archive?.exhausted),
      materializedAt: (request.materialized_at as string | null) ?? null,
      reelsMaterialized: (request.reels_materialized as number | null) ?? 0,
      error: (archive?.last_error as string | null | undefined) ?? null,
    };
  });
}
