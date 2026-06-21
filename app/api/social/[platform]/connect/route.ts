import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isPlatform } from "@/lib/publishing/types";

// OAuth initiation for the net-new publishing platforms (TikTok, YouTube).
// Instagram/Facebook reuse the existing /api/ig/connect flow. Mirrors that
// pattern: sign a random `state` into an httpOnly cookie, redirect to the
// provider's consent screen, verify on the way back in the callback.

const STATE_COOKIE = "reelspy_social_oauth_state";
const SETTINGS = "/dashboard/publishing/connections";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ platform: string }> }
) {
  const { platform } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  if (!isPlatform(platform) || (platform !== "tiktok" && platform !== "youtube")) {
    return NextResponse.redirect(new URL(`${SETTINGS}?error=unsupported_platform`, request.url));
  }

  const state = randomUUID();
  let authUrl: string | null = null;

  if (platform === "tiktok") {
    const clientKey = process.env.TIKTOK_CLIENT_KEY;
    const redirectUri = process.env.TIKTOK_REDIRECT_URI;
    if (!clientKey || !redirectUri) {
      return NextResponse.redirect(new URL(`${SETTINGS}?error=tiktok_env_missing`, request.url));
    }
    const url = new URL("https://www.tiktok.com/v2/auth/authorize/");
    url.searchParams.set("client_key", clientKey);
    url.searchParams.set("scope", "user.info.basic,video.publish,video.upload");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    authUrl = url.toString();
  } else {
    const clientId = process.env.YOUTUBE_CLIENT_ID;
    const redirectUri = process.env.YOUTUBE_REDIRECT_URI;
    if (!clientId || !redirectUri) {
      return NextResponse.redirect(new URL(`${SETTINGS}?error=youtube_env_missing`, request.url));
    }
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set(
      "scope",
      "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly"
    );
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", state);
    authUrl = url.toString();
  }

  const response = NextResponse.redirect(authUrl);
  // Scope the state to the platform so two parallel connect flows can't collide.
  response.cookies.set(STATE_COOKIE, `${platform}:${state}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  });
  return response;
}
