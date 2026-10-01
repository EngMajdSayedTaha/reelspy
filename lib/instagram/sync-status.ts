// What the top bar shows about syncing.
//
// This replaces the old "hourly sync capacity" gauge, which reported the user's
// share of Meta's Business Discovery budget. That number was measuring the
// wrong thing: "Sync All" takes the deferred path in app/api/ig/sync/route.ts,
// which serves the shared snapshot cache and enqueues background jobs without
// ever calling Meta. So the gauge sat at 100% no matter how much the user
// synced, and the only copy that could explain it was an apology for the number
// not moving. A budget you don't spend is not a useful thing to show someone.
//
// What a user actually wants to know is whether their reels are current. So we
// report STATE, not capacity: up to date / refreshing / paused. The quota still
// exists and is still enforced — it just surfaces where it can be acted on (the
// per-account Sync button, once it's nearly spent) instead of following the
// user around the app.
//
// Every instant here is absolute (ISO). The client derives countdowns from the
// clock, so a backgrounded tab can't desynchronise them.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readAppPausedUntil, readUserQuota, userHourlyRefreshCap } from "@/lib/instagram/rate-limit";
import { normalizeUsername, pickHealthyToken } from "@/lib/instagram/snapshots";
import { syncBlockerFor, type SyncBlockerCode } from "@/lib/instagram/sync-blocker";
import { resolveUserEntitlements } from "@/lib/billing/resolve";

export type SyncState = "idle" | "refreshing" | "paused" | "blocked";

export type SyncStatus = {
  state: SyncState;
  /** Most recent successful sync across the user's tracked accounts. */
  lastSyncedAt: string | null;
  /** Accounts with a background refresh queued or running right now. */
  refreshingCount: number;
  /** Absolute instant the app-wide pause lifts; null when not paused. */
  pausedUntil: string | null;
  /**
   * Set when nothing in the app can refresh reels (no healthy Facebook-Login
   * token), classified for THIS user so the chip can say what to fix.
   */
  blocked: SyncBlockerCode | null;
  quota: { used: number; limit: number; resetAt: string | null };
};

export const NEUTRAL_SYNC_STATUS: SyncStatus = {
  state: "idle",
  lastSyncedAt: null,
  refreshingCount: 0,
  pausedUntil: null,
  blocked: null,
  quota: { used: 0, limit: 0, resetAt: null },
};

export async function readSyncStatus(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  userId: string
): Promise<SyncStatus> {
  const [{ entitlements }, { data: accounts }, pausedUntil, blocked] = await Promise.all([
    resolveUserEntitlements(supabase, userId),
    supabase
      .from("inspiration_accounts")
      .select("ig_username, last_synced_at")
      .eq("user_id", userId)
      .eq("is_active", true),
    readAppPausedUntil(admin),
    readBlocker(admin, userId),
  ]);

  const limit = userHourlyRefreshCap(entitlements.accounts);
  const quota = await readUserQuota(admin, userId, limit);

  const rows = accounts ?? [];

  const lastSyncedAt =
    rows
      .map((a) => a.last_synced_at)
      .filter((v): v is string => Boolean(v))
      .sort()
      .at(-1) ?? null;

  // Background refreshes are deduped by username (`refresh:<uname>`), so a job
  // is shared by every user tracking that account — which is exactly what we
  // want to count: how many of THIS user's accounts are currently updating.
  let refreshingCount = 0;
  if (rows.length > 0) {
    const dedupKeys = rows.map((a) => `refresh:${normalizeUsername(a.ig_username)}`);
    const { count } = await admin
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("kind", "refresh_snapshot")
      .in("status", ["queued", "running"])
      .in("dedup_key", dedupKeys);
    refreshingCount = count ?? 0;
  }

  // Blocked outranks everything: no refresh can run at all, so "Synced 47d ago"
  // with a green tick would be a lie. Paused outranks refreshing: the
  // refreshes are real but stalled, and telling someone work is in progress
  // while Meta is blocking it reads as a lie once they notice nothing changed.
  const state: SyncState = blocked
    ? "blocked"
    : pausedUntil
      ? "paused"
      : refreshingCount > 0
        ? "refreshing"
        : "idle";

  return { state, lastSyncedAt, refreshingCount, pausedUntil, blocked, quota };
}

// Null while any healthy research token exists — a background refresh can then
// serve this user whatever way they connected. Only when there is none does it
// matter how THIS user is connected, because that decides what they can fix.
async function readBlocker(admin: SupabaseClient, userId: string): Promise<SyncBlockerCode | null> {
  if (await pickHealthyToken(admin)) return null;
  const { data } = await admin
    .from("profiles")
    .select("ig_user_id, ig_auth_flow")
    .eq("id", userId)
    .maybeSingle();
  const authFlow = data?.ig_auth_flow === "instagram_login" ? "instagram_login" : "facebook_login";
  return syncBlockerFor(authFlow, Boolean(data?.ig_user_id)).code;
}
