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

export type IgCredentials = {
  igUserId: string;
  token: string;
  status: string;
  expiresAt: string | null;
};

// Returns the user's IG credentials, or null when not connected.
export async function getIgCredentials(
  admin: SupabaseClient,
  userId: string
): Promise<IgCredentials | null> {
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
    })
    .eq("id", userId);

  if (error) throw new Error(error.message);
}
