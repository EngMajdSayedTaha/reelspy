// Shared "get me a live access token" resolver for the OAuth-refresh platforms
// (TikTok / YouTube / Threads). Extracted from dispatcher.ts so the creator-info
// route (T4) can resolve a usable TikTok token the same way the dispatcher does,
// instead of re-implementing the expiry/refresh/invalidate dance a second time.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getConnection, markConnectionInvalid, updateConnectionTokens } from "./token-store";
import { refreshTikTokToken } from "./adapters/tiktok";
import { refreshYouTubeToken } from "./adapters/youtube";
import { refreshThreadsToken } from "./adapters/threads";
import { PLATFORM_LABELS, type OAuthPlatform, type SocialConnection } from "./types";

export type OAuthTokenResult =
  | { accessToken: string; connection: SocialConnection }
  | { error: string };

export async function resolveOAuthAccessToken(
  admin: SupabaseClient,
  userId: string,
  platform: OAuthPlatform
): Promise<OAuthTokenResult> {
  const label = PLATFORM_LABELS[platform];
  const conn = await getConnection(admin, userId, platform);
  if (!conn?.access_token) return { error: `${label} is not connected.` };

  const expired =
    conn.token_expires_at != null &&
    new Date(conn.token_expires_at).getTime() <= Date.now() + 60_000;

  if (!expired) return { accessToken: conn.access_token, connection: conn };

  // TikTok and YouTube exchange a separate refresh token. Threads refreshes the
  // long-lived ACCESS token in place (th_refresh_token), so there is no refresh
  // token to check — a Threads connection is refreshable as long as it has a
  // token that hasn't already lapsed.
  if (platform !== "threads" && !conn.refresh_token) {
    await markConnectionInvalid(admin, conn.id);
    return { error: `${label} session expired — reconnect the account.` };
  }

  try {
    if (platform === "tiktok") {
      const r = await refreshTikTokToken(conn.refresh_token!);
      await updateConnectionTokens(admin, conn.id, {
        accessToken: r.accessToken,
        refreshToken: r.refreshToken,
        expiresAt: new Date(Date.now() + r.expiresInSeconds * 1000).toISOString(),
      });
      return { accessToken: r.accessToken, connection: conn };
    }

    if (platform === "threads") {
      const r = await refreshThreadsToken(conn.access_token);
      await updateConnectionTokens(admin, conn.id, {
        accessToken: r.accessToken,
        expiresAt: new Date(Date.now() + r.expiresInSeconds * 1000).toISOString(),
      });
      return { accessToken: r.accessToken, connection: conn };
    }

    const r = await refreshYouTubeToken(conn.refresh_token!);
    await updateConnectionTokens(admin, conn.id, {
      accessToken: r.accessToken,
      expiresAt: new Date(Date.now() + r.expiresInSeconds * 1000).toISOString(),
    });
    return { accessToken: r.accessToken, connection: conn };
  } catch {
    await markConnectionInvalid(admin, conn.id);
    return { error: `${label} session expired — reconnect the account.` };
  }
}
