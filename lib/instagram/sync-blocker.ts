// Why reel syncing can't make progress right now — and what the user can do
// about it.
//
// Every refresh of a tracked account goes through Business Discovery, which
// only a healthy *Facebook Login* Instagram token can call (Instagram-Login
// tokens get "nonexisting field (business_discovery)"). When the app has no
// such token, Sync All used to serve the stale cache, report
// "Synced: +0 new · 0 refreshed" as a success, and the top bar kept saying
// "Synced 47d ago" with a green tick. These codes replace that silence with a
// named problem and a fix.
//
// Dependency-free on purpose: the client components import the code union and
// the server routes import the classifier, so nothing server-only may land here.

export type SyncBlockerCode =
  /** This user is connected via Instagram Login, which can't read other accounts. */
  | "needs_facebook_login"
  /** This user's Facebook-linked connection exists but is no longer usable. */
  | "reconnect_required"
  /** This user has no Instagram connection at all. */
  | "not_connected";

export type SyncBlocker = { code: SyncBlockerCode; message: string };

export const SYNC_BLOCKER_CODES: readonly SyncBlockerCode[] = [
  "needs_facebook_login",
  "reconnect_required",
  "not_connected",
];

// English fallbacks for non-UI consumers (logs, API responses read by curl).
// The dashboard localizes by `code` instead.
const MESSAGES: Record<SyncBlockerCode, string> = {
  needs_facebook_login:
    "Your Instagram is connected via Instagram Login, which can't read other accounts' reels. Reconnect with Facebook on the Connections page to resume syncing.",
  reconnect_required:
    "Your Instagram connection can no longer refresh reels. Reconnect it with Facebook on the Connections page to resume syncing.",
  not_connected:
    "Syncing needs a Facebook-linked Instagram connection. Connect one on the Connections page.",
};

export const SYNC_BLOCKER_FIX_HREF = "/dashboard/connections";

/**
 * Classifies the blocker for one user, given that the app has NO healthy
 * research token. (When one exists, nobody is blocked — background refreshes
 * use the shared pool regardless of how this user connected.)
 */
export function syncBlockerFor(
  authFlow: "facebook_login" | "instagram_login" | null | undefined,
  connected: boolean
): SyncBlocker {
  const code: SyncBlockerCode = !connected
    ? "not_connected"
    : authFlow === "instagram_login"
      ? "needs_facebook_login"
      : "reconnect_required";
  return { code, message: MESSAGES[code] };
}

export function isSyncBlockerCode(value: unknown): value is SyncBlockerCode {
  return typeof value === "string" && (SYNC_BLOCKER_CODES as readonly string[]).includes(value);
}
