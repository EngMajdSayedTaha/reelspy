// Server-only access layer for multi-platform OAuth credentials.
//
// Same rationale as lib/instagram/token-store.ts: access/refresh tokens grant
// long-lived posting rights to a creator's accounts, so they must never transit
// the anon/authenticated Postgres roles. The migration 20260621_publishing.sql
// revokes the token columns from browser roles; every read/write here goes
// through the service-role client. Callers verify the session themselves and
// pass the authenticated user's id — this module does storage only.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Platform, SocialConnection } from "./types";

const CONNECTION_COLUMNS =
  "id, user_id, platform, account_id, account_name, account_username, avatar_url, " +
  "access_token, refresh_token, token_expires_at, token_status, scopes, is_active";

// Public (browser-safe) columns — no tokens. Used by server components that read
// through the regular authenticated client for rendering connection cards.
export const PUBLIC_CONNECTION_COLUMNS =
  "id, platform, account_id, account_name, account_username, avatar_url, " +
  "token_status, token_expires_at, scopes, is_active";

export async function listConnections(
  admin: SupabaseClient,
  userId: string
): Promise<SocialConnection[]> {
  const { data, error } = await admin
    .from("social_connections")
    .select(CONNECTION_COLUMNS)
    .eq("user_id", userId);

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as SocialConnection[];
}

export async function getConnection(
  admin: SupabaseClient,
  userId: string,
  platform: Platform
): Promise<SocialConnection | null> {
  const { data, error } = await admin
    .from("social_connections")
    .select(CONNECTION_COLUMNS)
    .eq("user_id", userId)
    .eq("platform", platform)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as unknown as SocialConnection | null) ?? null;
}

export type UpsertConnectionParams = {
  accountId: string;
  accountName?: string | null;
  accountUsername?: string | null;
  avatarUrl?: string | null;
  accessToken: string;
  refreshToken?: string | null;
  expiresAt: string | null;
  scopes?: string | null;
};

export async function upsertConnection(
  admin: SupabaseClient,
  userId: string,
  platform: Platform,
  params: UpsertConnectionParams
): Promise<void> {
  const { error } = await admin.from("social_connections").upsert(
    {
      user_id: userId,
      platform,
      account_id: params.accountId,
      account_name: params.accountName ?? null,
      account_username: params.accountUsername ?? null,
      avatar_url: params.avatarUrl ?? null,
      access_token: params.accessToken,
      refresh_token: params.refreshToken ?? null,
      token_expires_at: params.expiresAt,
      token_status: "active",
      scopes: params.scopes ?? null,
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,platform,account_id" }
  );

  if (error) throw new Error(error.message);
}

// Persist a freshly refreshed access token (and rotated refresh token, if any).
export async function updateConnectionTokens(
  admin: SupabaseClient,
  connectionId: string,
  params: { accessToken: string; refreshToken?: string | null; expiresAt: string | null }
): Promise<void> {
  const patch: Record<string, unknown> = {
    access_token: params.accessToken,
    token_expires_at: params.expiresAt,
    token_status: "active",
    updated_at: new Date().toISOString(),
  };
  if (params.refreshToken) patch.refresh_token = params.refreshToken;

  const { error } = await admin
    .from("social_connections")
    .update(patch)
    .eq("id", connectionId);

  if (error) throw new Error(error.message);
}

export async function markConnectionInvalid(
  admin: SupabaseClient,
  connectionId: string
): Promise<void> {
  await admin
    .from("social_connections")
    .update({ token_status: "invalid", updated_at: new Date().toISOString() })
    .eq("id", connectionId);
}

export async function clearConnection(
  admin: SupabaseClient,
  userId: string,
  platform: Platform
): Promise<void> {
  const { error } = await admin
    .from("social_connections")
    .delete()
    .eq("user_id", userId)
    .eq("platform", platform);

  if (error) throw new Error(error.message);
}
