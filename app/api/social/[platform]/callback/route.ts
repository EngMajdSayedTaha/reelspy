import { type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createRouteClient } from "@/lib/supabase/route";
import { createAdminClient } from "@/lib/supabase/admin";
import { upsertConnection } from "@/lib/publishing/token-store";
import { isOAuthPlatform } from "@/lib/publishing/types";
import { getSocialRedirectUri } from "@/lib/publishing/oauth-redirect";
import { relativeRedirect } from "@/lib/http/redirect";

// OAuth callback for TikTok / YouTube / Threads: verify state, exchange the code
// for tokens, and persist them with the service-role client (browser roles can't
// see the token columns — see 20260621_publishing.sql).

const STATE_COOKIE = "reelspy_social_oauth_state";
const SETTINGS = "/dashboard/connections";

function fail(code: string) {
  const res = relativeRedirect(`${SETTINGS}?error=${encodeURIComponent(code)}`);
  res.cookies.delete(STATE_COOKIE);
  return res;
}

async function exchangeTikTok(code: string) {
  const clientKey = process.env.TIKTOK_CLIENT_KEY!;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET!;
  // Must match the redirect_uri used in the authorize step exactly.
  const redirectUri = getSocialRedirectUri("tiktok");

  const tokenRes = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  const token = (await tokenRes.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    open_id?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };
  if (!tokenRes.ok || !token.access_token || !token.open_id) {
    throw new Error(token.error_description ?? token.error ?? "tiktok_token_failed");
  }

  // Display name for the connection card (best-effort).
  let username: string | null = null;
  try {
    const infoRes = await fetch(
      "https://open.tiktokapis.com/v2/user/info/?fields=display_name,username,avatar_url",
      { headers: { Authorization: `Bearer ${token.access_token}` }, cache: "no-store" }
    );
    const info = (await infoRes.json()) as {
      data?: { user?: { display_name?: string; username?: string } };
    };
    username = info.data?.user?.username ?? info.data?.user?.display_name ?? null;
  } catch {
    // ignore
  }

  return {
    accountId: token.open_id,
    accountUsername: username,
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? null,
    expiresAt: token.expires_in
      ? new Date(Date.now() + token.expires_in * 1000).toISOString()
      : null,
    scopes: token.scope ?? null,
  };
}

async function exchangeYouTube(code: string) {
  const clientId = process.env.YOUTUBE_CLIENT_ID!;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET!;
  // Must match the redirect_uri used in the authorize step exactly.
  const redirectUri = getSocialRedirectUri("youtube");

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  const token = (await tokenRes.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
    error_description?: string;
  };
  if (!tokenRes.ok || !token.access_token) {
    throw new Error(token.error_description ?? token.error ?? "youtube_token_failed");
  }

  // Resolve the channel id/title for the connection card.
  let channelId = "me";
  let channelTitle: string | null = null;
  let avatarUrl: string | null = null;
  try {
    const chRes = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
      { headers: { Authorization: `Bearer ${token.access_token}` }, cache: "no-store" }
    );
    const ch = (await chRes.json()) as {
      items?: Array<{
        id?: string;
        snippet?: { title?: string; thumbnails?: { default?: { url?: string } } };
      }>;
    };
    const item = ch.items?.[0];
    if (item?.id) channelId = item.id;
    channelTitle = item?.snippet?.title ?? null;
    avatarUrl = item?.snippet?.thumbnails?.default?.url ?? null;
  } catch {
    // ignore
  }

  return {
    accountId: channelId,
    accountName: channelTitle,
    avatarUrl,
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? null,
    expiresAt: token.expires_in
      ? new Date(Date.now() + token.expires_in * 1000).toISOString()
      : null,
    scopes: token.scope ?? null,
  };
}

// Threads runs a two-step exchange: the authorization code buys a SHORT-lived
// (1h) token, which must immediately be swapped for the 60-day long-lived one.
// Skipping the second step leaves a connection that dies within the hour.
async function exchangeThreads(code: string) {
  const clientId = process.env.THREADS_APP_ID!;
  const clientSecret = process.env.THREADS_APP_SECRET!;
  const redirectUri = getSocialRedirectUri("threads");

  const shortRes = await fetch("https://graph.threads.net/oauth/access_token", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });
  const short = (await shortRes.json()) as {
    access_token?: string;
    user_id?: string | number;
    error_message?: string;
    error_type?: string;
  };
  if (!shortRes.ok || !short.access_token || short.user_id == null) {
    throw new Error(short.error_message ?? short.error_type ?? "threads_token_failed");
  }

  // Exchange for the long-lived token straight away.
  const longUrl = new URL("https://graph.threads.net/access_token");
  longUrl.searchParams.set("grant_type", "th_exchange_token");
  longUrl.searchParams.set("client_secret", clientSecret);
  longUrl.searchParams.set("access_token", short.access_token);

  const longRes = await fetch(longUrl, { cache: "no-store" });
  const long = (await longRes.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: { message?: string };
  };
  if (!longRes.ok || !long.access_token) {
    throw new Error(long.error?.message ?? "threads_long_token_failed");
  }

  const accessToken = long.access_token;
  // 60 days, per the Threads long-lived token docs.
  const expiresIn = long.expires_in ?? 60 * 24 * 60 * 60;

  // Handle + avatar for the connection card (best-effort).
  let username: string | null = null;
  let avatarUrl: string | null = null;
  try {
    const meUrl = new URL("https://graph.threads.net/v1.0/me");
    meUrl.searchParams.set("fields", "id,username,threads_profile_picture_url");
    meUrl.searchParams.set("access_token", accessToken);
    const meRes = await fetch(meUrl, { cache: "no-store" });
    if (meRes.ok) {
      const me = (await meRes.json()) as {
        username?: string;
        threads_profile_picture_url?: string;
      };
      username = me.username ?? null;
      avatarUrl = me.threads_profile_picture_url ?? null;
    }
  } catch {
    // ignore
  }

  return {
    accountId: String(short.user_id),
    accountUsername: username,
    avatarUrl,
    accessToken,
    // Threads refreshes the access token in place (th_refresh_token), so there
    // is no separate refresh token to store.
    refreshToken: null,
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    scopes: "threads_basic,threads_content_publish",
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  const { platform } = await params;
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const state = url.searchParams.get("state");

  if (error) return fail(error);
  if (!code) return fail("missing_code");
  if (!isOAuthPlatform(platform)) {
    return fail("unsupported_platform");
  }

  const cookieStore = await cookies();
  const expected = cookieStore.get(STATE_COOKIE)?.value;
  if (!state || expected !== `${platform}:${state}`) {
    return fail("invalid_state");
  }

  // Route-handler client: carry refreshed/rotated session cookies onto the
  // redirects below so a mobile user coming back from the provider isn't bounced
  // to /login with the connection unsaved (see lib/supabase/route).
  const { supabase, applyCookies } = await createRouteClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return applyCookies(relativeRedirect("/login"));

  try {
    const admin = createAdminClient();

    if (platform === "tiktok") {
      const t = await exchangeTikTok(code);
      await upsertConnection(admin, user.id, "tiktok", {
        accountId: t.accountId,
        accountUsername: t.accountUsername,
        accessToken: t.accessToken,
        refreshToken: t.refreshToken,
        expiresAt: t.expiresAt,
        scopes: t.scopes,
      });
    } else if (platform === "threads") {
      const t = await exchangeThreads(code);
      await upsertConnection(admin, user.id, "threads", {
        accountId: t.accountId,
        accountUsername: t.accountUsername,
        avatarUrl: t.avatarUrl,
        accessToken: t.accessToken,
        refreshToken: t.refreshToken,
        expiresAt: t.expiresAt,
        scopes: t.scopes,
      });
    } else {
      const y = await exchangeYouTube(code);
      await upsertConnection(admin, user.id, "youtube", {
        accountId: y.accountId,
        accountName: y.accountName,
        avatarUrl: y.avatarUrl,
        accessToken: y.accessToken,
        refreshToken: y.refreshToken,
        expiresAt: y.expiresAt,
        scopes: y.scopes,
      });
    }

    const res = applyCookies(relativeRedirect(`${SETTINGS}?success=connected`));
    res.cookies.delete(STATE_COOKIE);
    return res;
  } catch (err) {
    console.error(`${platform} OAuth callback failed`, err);
    return applyCookies(fail("oauth_failed"));
  }
}
