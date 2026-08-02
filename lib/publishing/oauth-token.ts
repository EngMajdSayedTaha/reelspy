// Shared "get me a live access token" resolver for the two OAuth-refresh
// platforms (TikTok/YouTube). Extracted from dispatcher.ts so the new
// creator-info route (T4) can resolve a usable TikTok token the same way the
// dispatcher does, instead of re-implementing the expiry/refresh/invalidate
// dance a second time.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getConnection, markConnectionInvalid, updateConnectionTokens } from "./token-store";
import { refreshTikTokToken } from "./adapters/tiktok";
import { refreshYouTubeToken } from "./adapters/youtube";
import type { SocialConnection } from "./types";

export type OAuthTokenResult =
  | { accessToken: string; connection: SocialConnection }
  | { error: string };

export async function resolveOAuthAccessToken(
  admin: SupabaseClient,
  userId: string,
  platform: "tiktok" | "youtube"
): Promise<OAuthTokenResult> {
  const conn = await getConnection(admin, userId, platform);
  if (!conn?.access_token) return { error: `${platform} is not connected.` };

  const expired =
    conn.token_expires_at != null &&
    new Date(conn.token_expires_at).getTime() <= Date.now() + 60_000;

  if (!expired) return { accessToken: conn.access_token, connection: conn };

  if (!conn.refresh_token) {
    await markConnectionInvalid(admin, conn.id);
    return { error: `${platform} session expired — reconnect the account.` };
  }

  try {
    if (platform === "tiktok") {
      const r = await refreshTikTokToken(conn.refresh_token);
      await updateConnectionTokens(admin, conn.id, {
        accessToken: r.accessToken,
        refreshToken: r.refreshToken,
        expiresAt: new Date(Date.now() + r.expiresInSeconds * 1000).toISOString(),
      });
      return { accessToken: r.accessToken, connection: conn };
    }
    const r = await refreshYouTubeToken(conn.refresh_token);
    await updateConnectionTokens(admin, conn.id, {
      accessToken: r.accessToken,
      expiresAt: new Date(Date.now() + r.expiresInSeconds * 1000).toISOString(),
    });
    return { accessToken: r.accessToken, connection: conn };
  } catch {
    await markConnectionInvalid(admin, conn.id);
    return { error: `${platform} session expired — reconnect the account.` };
  }
}
