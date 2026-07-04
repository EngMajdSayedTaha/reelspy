// Server-only access layer for Instagram credentials.
//
// The long-lived Meta user token is the most sensitive thing we store: with it
// anyone can read the creator's Pages/IG data for ~60 days. It must therefore
// never transit through the anon/authenticated Postgres roles (i.e. never be
// SELECTable by the browser client — an XSS would exfiltrate it in one call).
// All reads/writes go through the service-role client here, and the migration
// 20260611_lock_down_ig_tokens.sql revokes client access to the token column.
//
// Callers MUST verify the Supabase session themselves and pass the
// authenticated user's id — this module does authorization-free storage only.

import type { SupabaseClient } from "@supabase/supabase-js";
import { clearIgConnections, getActiveIgCredentials } from "./connections";

export type IgCredentials = {
  igUserId: string;
  token: string;
  status: string;
  expiresAt: string | null;
};

// Returns the user's IG credentials, or null when not connected.
//
// Multi-account (X4): when the user has an ACTIVE ig_connections row, its
// credential wins — that's how a Studio user switches which IG account drives
// research. The lookup is fail-open (see connections.ts): no active connection /
// missing table ⇒ null ⇒ we fall through to the legacy profiles.ig_* credential,
// so behavior is unchanged until the migration is applied and a connection is
// selected.
export async function getIgCredentials(
  admin: SupabaseClient,
  userId: string
): Promise<IgCredentials | null> {
  const active = await getActiveIgCredentials(admin, userId);
  if (active) return active;

  const { data, error } = await admin
    .from("profiles")
    .select("ig_access_token, ig_user_id, ig_token_status, ig_token_expires_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.ig_access_token || !data.ig_user_id) return null;

  return {
    igUserId: data.ig_user_id,
    token: data.ig_access_token,
    status: data.ig_token_status ?? "active",
    expiresAt: data.ig_token_expires_at ?? null,
  };
}

export async function storeIgToken(
  admin: SupabaseClient,
  userId: string,
  params: { token: string; igUserId: string; username: string; expiresAt: string | null }
): Promise<void> {
  const { error } = await admin
    .from("profiles")
    .update({
      ig_access_token: params.token,
      ig_user_id: params.igUserId,
      username: params.username,
      ig_token_expires_at: params.expiresAt,
      ig_token_status: "active",
      ig_token_refreshed_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) throw new Error(error.message);
}

export async function clearIgToken(admin: SupabaseClient, userId: string): Promise<void> {
  const { error } = await admin
    .from("profiles")
    .update({
      ig_access_token: null,
      ig_user_id: null,
      ig_token_expires_at: null,
      ig_token_status: "active",
      ig_token_refreshed_at: null,
      fb_page_id: null,
      fb_page_name: null,
      fb_page_access_token: null,
      webhook_subscribed_at: null,
    })
    .eq("id", userId);

  if (error) throw new Error(error.message);

  // Multi-account (X4): also drop the connection rows + active pointer so a
  // disconnect fully clears the credential. Fail-open (no-op pre-migration).
  await clearIgConnections(admin, userId);
}

// ── Facebook Page credentials (Auto-Reply module) ────────────────────────────
// Private replies (comment-to-DM) are sent with a PAGE access token. It's
// derived from the long-lived user token, so it gets the same treatment: only
// readable/writable through the service-role client (columns excluded from the
// client grants, see 20260613_auto_reply.sql).

export type PageCredentials = {
  pageId: string;
  pageName: string | null;
  pageToken: string;
};

export async function getPageCredentials(
  admin: SupabaseClient,
  userId: string
): Promise<PageCredentials | null> {
  const { data, error } = await admin
    .from("profiles")
    .select("fb_page_id, fb_page_name, fb_page_access_token")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.fb_page_id || !data.fb_page_access_token) return null;

  return {
    pageId: data.fb_page_id,
    pageName: data.fb_page_name ?? null,
    pageToken: data.fb_page_access_token,
  };
}

export async function storePageCredentials(
  admin: SupabaseClient,
  userId: string,
  params: { pageId: string; pageName?: string | null; pageToken: string }
): Promise<void> {
  const { error } = await admin
    .from("profiles")
    .update({
      fb_page_id: params.pageId,
      fb_page_name: params.pageName ?? null,
      fb_page_access_token: params.pageToken,
    })
    .eq("id", userId);

  if (error) throw new Error(error.message);
}

export async function markWebhookSubscribed(
  admin: SupabaseClient,
  userId: string
): Promise<void> {
  const { error } = await admin
    .from("profiles")
    .update({ webhook_subscribed_at: new Date().toISOString() })
    .eq("id", userId);

  if (error) throw new Error(error.message);
}
