import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { upsertConnection } from "@/lib/publishing/token-store";
import { isPlatform, type Platform } from "@/lib/publishing/types";

// OAuth callback for TikTok / YouTube: verify state, exchange the code for
// tokens, and persist them with the service-role client (browser roles can't
// see the token columns — see 20260621_publishing.sql).

const STATE_COOKIE = "reelspy_social_oauth_state";
const SETTINGS = "/dashboard/connections";

function fail(request: NextRequest, code: string) {
  const res = NextResponse.redirect(new URL(`${SETTINGS}?error=${code}`, request.url));
  res.cookies.delete(STATE_COOKIE);
  return res;
}

async function exchangeTikTok(code: string) {
  const clientKey = process.env.TIKTOK_CLIENT_KEY!;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET!;
  const redirectUri = process.env.TIKTOK_REDIRECT_URI!;

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
  const redirectUri = process.env.YOUTUBE_REDIRECT_URI!;

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  const { platform } = await params;
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const state = url.searchParams.get("state");

  if (error) return fail(request, error);
  if (!code) return fail(request, "missing_code");
  if (!isPlatform(platform) || (platform !== "tiktok" && platform !== "youtube")) {
    return fail(request, "unsupported_platform");
  }

  const cookieStore = await cookies();
  const expected = cookieStore.get(STATE_COOKIE)?.value;
  if (!state || expected !== `${platform}:${state}`) {
    return fail(request, "invalid_state");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  try {
    const admin = createAdminClient();
    const p = platform as Platform;

    if (p === "tiktok") {
      const t = await exchangeTikTok(code);
      await upsertConnection(admin, user.id, "tiktok", {
        accountId: t.accountId,
        accountUsername: t.accountUsername,
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

    const res = NextResponse.redirect(new URL(`${SETTINGS}?success=connected`, request.url));
    res.cookies.delete(STATE_COOKIE);
    return res;
  } catch (err) {
    console.error(`${platform} OAuth callback failed`, err);
    return fail(request, "oauth_failed");
  }
}
