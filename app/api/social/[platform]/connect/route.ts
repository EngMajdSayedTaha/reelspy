import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createRouteClient } from "@/lib/supabase/route";
import { isPlatform } from "@/lib/publishing/types";
import { getSocialRedirectUri } from "@/lib/publishing/oauth-redirect";
import { relativeRedirect } from "@/lib/http/redirect";
import { checkOAuthOrigin } from "@/lib/oauth/origin";
import { oauthLog, requestContext } from "@/lib/oauth/log";

// OAuth initiation for the net-new publishing platforms (TikTok, YouTube).
// Instagram/Facebook reuse the existing /api/ig/connect flow. Mirrors that
// pattern: sign a random `state` into an httpOnly cookie, redirect to the
// provider's consent screen, verify on the way back in the callback.

const STATE_COOKIE = "reelspy_social_oauth_state";
const SETTINGS = "/dashboard/connections";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ platform: string }> }
) {
  const { platform } = await params;
  const ctx = requestContext(request);

  if (!isPlatform(platform) || (platform !== "tiktok" && platform !== "youtube")) {
    return relativeRedirect(`${SETTINGS}?error=unsupported_platform`);
  }

  // Origin pin — before any cookie is written. reelspy.dev proxies /api/* to
  // this deployment, so this handler can run on an origin the provider will
  // never return to, and both the state cookie and the session cookie would be
  // dropped on the way back. Same defect as the Instagram flow; see
  // lib/oauth/origin.ts.
  const origin = checkOAuthOrigin(
    request,
    getSocialRedirectUri(platform),
    `/api/social/${platform}/connect`
  );
  if (origin.pinned) {
    oauthLog({
      flow: platform,
      step: "connect:origin-pinned",
      from: origin.requestOrigin,
      to: origin.canonicalOrigin,
      ...ctx,
    });
    return NextResponse.redirect(origin.redirectTo, 307);
  }

  // Route-handler client: carry any refreshed/rotated session cookies onto the
  // redirects below so a mobile user on an expired token reaches the provider's
  // consent screen instead of being bounced to /login (see lib/supabase/route).
  const { supabase, applyCookies } = await createRouteClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    oauthLog({ flow: platform, step: "connect:no-session", ...ctx });
    return applyCookies(relativeRedirect("/login?error=session_expired"));
  }

  const state = randomUUID();
  let authUrl: string | null = null;

  if (platform === "tiktok") {
    const clientKey = process.env.TIKTOK_CLIENT_KEY;
    const redirectUri = getSocialRedirectUri("tiktok");
    if (!clientKey) {
      return applyCookies(relativeRedirect(`${SETTINGS}?error=tiktok_env_missing`));
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
    const redirectUri = getSocialRedirectUri("youtube");
    if (!clientId) {
      return applyCookies(relativeRedirect(`${SETTINGS}?error=youtube_env_missing`));
    }
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    // youtube.force-ssl is required to POST comment replies (the upload/readonly
    // scopes can't write comments) — see the YouTube comment auto-reply module.
    url.searchParams.set(
      "scope",
      "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.force-ssl"
    );
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", state);
    authUrl = url.toString();
  }

  oauthLog({ flow: platform, step: "connect:redirecting", origin: origin.canonicalOrigin, ...ctx });

  const response = applyCookies(NextResponse.redirect(authUrl));
  // Scope the state to the platform so two parallel connect flows can't collide.
  response.cookies.set(STATE_COOKIE, `${platform}:${state}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // One hour, not ten minutes: provider consent on a phone (sign-in, SMS 2FA,
    // account picker) routinely outlives the old window, and an expired cookie
    // surfaces as an unexplained "could not be verified" on the way back.
    maxAge: 60 * 60,
  });
  return response;
}
