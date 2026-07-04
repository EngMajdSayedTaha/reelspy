// Studio multi-account IG connections (roadmap X4). Per-connection research
// credentials, one of which is "active" (drives Business Discovery / sync /
// insights / auto-reply). This layer sits IN FRONT of the legacy single
// `profiles.ig_*` credential and is FAIL-OPEN: if the ig_connections table
// isn't present yet (migration 20260704130000 not applied) or any read errors,
// every function degrades to "no connections" so the caller falls back to the
// profiles credential — i.e. the app behaves exactly as before the migration.
//
// Service-role only (token columns are revoked from browser roles, H3). Callers
// verify the session and pass the authenticated user's id.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { IgCredentials } from "./token-store";

// Non-token fields only — safe to hand to the UI.
export type IgConnectionSummary = {
  id: string;
  igUserId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  tokenStatus: string;
  isActive: boolean;
};

type ConnRow = {
  id: string;
  ig_user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  token_status: string | null;
  is_active: boolean | null;
};

// List a user's IG connections (non-token). Empty on any error / missing table.
export async function listIgConnections(
  admin: SupabaseClient,
  userId: string
): Promise<IgConnectionSummary[]> {
  try {
    const { data, error } = await admin
      .from("ig_connections")
      .select("id, ig_user_id, username, display_name, avatar_url, token_status, is_active")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .returns<ConnRow[]>();
    if (error || !data) return [];
    return data.map((r) => ({
      id: r.id,
      igUserId: r.ig_user_id,
      username: r.username,
      displayName: r.display_name,
      avatarUrl: r.avatar_url,
      tokenStatus: r.token_status ?? "active",
      isActive: Boolean(r.is_active),
    }));
  } catch {
    return [];
  }
}

// The active connection's credentials, or null when there's no active connection
// (or the table/column doesn't exist). Null tells the token-store to fall back
// to profiles.ig_* — the legacy single-connection path.
export async function getActiveIgCredentials(
  admin: SupabaseClient,
  userId: string
): Promise<IgCredentials | null> {
  try {
    const { data: profile, error: pErr } = await admin
      .from("profiles")
      .select("active_ig_connection_id")
      .eq("id", userId)
      .maybeSingle();
    if (pErr || !profile?.active_ig_connection_id) return null;

    const { data: conn, error: cErr } = await admin
      .from("ig_connections")
      .select("ig_user_id, access_token, token_status, token_expires_at")
      .eq("id", profile.active_ig_connection_id as string)
      .eq("user_id", userId)
      .maybeSingle();
    if (cErr || !conn?.access_token || !conn.ig_user_id) return null;

    return {
      igUserId: conn.ig_user_id as string,
      token: conn.access_token as string,
      status: (conn.token_status as string) ?? "active",
      expiresAt: (conn.token_expires_at as string) ?? null,
    };
  } catch {
    return null;
  }
}

export type UpsertConnectionParams = {
  igUserId: string;
  username: string;
  token: string;
  expiresAt: string | null;
  avatarUrl?: string | null;
  pageId?: string | null;
  pageName?: string | null;
  pageToken?: string | null;
  webhookSubscribedAt?: string | null;
};

// Insert-or-refresh a connection for (user, ig_user_id) and return its id.
// Fail-open: returns null if the table isn't there (pre-migration) so the
// connect flow's primary profiles write still governs. Best-effort only.
export async function upsertIgConnection(
  admin: SupabaseClient,
  userId: string,
  params: UpsertConnectionParams
): Promise<string | null> {
  try {
    const { data, error } = await admin
      .from("ig_connections")
      .upsert(
        {
          user_id: userId,
          ig_user_id: params.igUserId,
          username: params.username,
          display_name: params.username,
          avatar_url: params.avatarUrl ?? null,
          access_token: params.token,
          token_expires_at: params.expiresAt,
          token_status: "active",
          token_refreshed_at: new Date().toISOString(),
          fb_page_id: params.pageId ?? null,
          fb_page_name: params.pageName ?? null,
          fb_page_access_token: params.pageToken ?? null,
          webhook_subscribed_at: params.webhookSubscribedAt ?? null,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,ig_user_id" }
      )
      .select("id")
      .maybeSingle();
    if (error || !data) return null;
    return data.id as string;
  } catch {
    return null;
  }
}

// Clear all of a user's IG connections + the active pointer (global disconnect).
// Fail-open: no-ops if the table/column isn't there yet. Called from
// clearIgToken so a disconnect can't leave an active connection whose token
// would keep getIgCredentials returning "connected".
export async function clearIgConnections(admin: SupabaseClient, userId: string): Promise<void> {
  try {
    await admin.from("profiles").update({ active_ig_connection_id: null }).eq("id", userId);
  } catch {
    // column may not exist pre-migration — ignore.
  }
  try {
    await admin.from("ig_connections").delete().eq("user_id", userId);
  } catch {
    // table may not exist pre-migration — ignore.
  }
}

// Point the user's active connection at `connectionId` (owner-verified) and flip
// the is_active flags. Returns false if the connection isn't the user's or the
// table is absent. Safe no-op pre-migration.
export async function setActiveIgConnection(
  admin: SupabaseClient,
  userId: string,
  connectionId: string
): Promise<boolean> {
  try {
    const { data: conn } = await admin
      .from("ig_connections")
      .select("id")
      .eq("id", connectionId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!conn) return false;

    // Single active flag per user (cosmetic; the pointer is the source of truth).
    await admin.from("ig_connections").update({ is_active: false }).eq("user_id", userId);
    await admin.from("ig_connections").update({ is_active: true }).eq("id", connectionId);
    const { error } = await admin
      .from("profiles")
      .update({ active_ig_connection_id: connectionId })
      .eq("id", userId);
    return !error;
  } catch {
    return false;
  }
}
