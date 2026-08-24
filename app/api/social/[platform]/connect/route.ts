import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { PREFS_COOKIE, parsePrefs } from "@/lib/prefs";
import { renderOAuthInterstitial } from "@/lib/oauth/interstitial";
import { createRouteClient } from "@/lib/supabase/route";
import { isOAuthPlatform, PLATFORM_LABELS } from "@/lib/publishing/types";
import { getSocialRedirectUri } from "@/lib/publishing/oauth-redirect";
import { relativeRedirect } from "@/lib/http/redirect";
import { checkOAuthOrigin } from "@/lib/oauth/origin";
import { oauthLog, requestContext } from "@/lib/oauth/log";

// OAuth initiation for the publishing platforms that carry their own tokens
// (TikTok, YouTube, Threads). Instagram/Facebook reuse the existing
// /api/ig/connect flow. Mirrors that pattern: sign a random `state` into an
// httpOnly cookie, redirect to the provider's consent screen, verify on the way
// back in the callback.

const STATE_COOKIE = "reelspy_social_oauth_state";
const SETTINGS = "/dashboard/connections";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ platform: string }> }
) {
  const { platform } = await params;
  const ctx = requestContext(request);

  if (!isOAuthPlatform(platform)) {
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
  } else if (platform === "threads") {
    // Threads is its own product inside the same Meta App Dashboard: adding the
    // Threads use case mints a SEPARATE Threads App ID + secret, and the consent
    // window lives on threads.net rather than facebook.com. META_APP_ID does not
    // work here — see docs/publishing-setup.md.
    const clientId = process.env.THREADS_APP_ID;
    const redirectUri = getSocialRedirectUri("threads");
    if (!clientId) {
      return applyCookies(relativeRedirect(`${SETTINGS}?error=threads_env_missing`));
    }
    const url = new URL("https://threads.net/oauth/authorize");
    url.searchParams.set("client_id", clientId);
    // threads_basic is required for every Threads endpoint;
    // threads_content_publish is what lets us post.
    url.searchParams.set("scope", "threads_basic,threads_content_publish");
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
    // Default keeps the full set the app actually uses today: youtube.upload
    // (Publishing) + youtube.readonly/youtube.force-ssl (the comment
    // auto-reply module — force-ssl is required to POST comment replies,
    // upload/readonly alone can't write comments). Y2/09-platform-access.md:
    // request the narrowest scope that verifies — override to just
    // `.../auth/youtube.upload` for the initial Google OAuth verification
    // submission (Gate A), then widen back (or leave unset) once approved,
    // same override-without-a-deploy pattern as META_IG_SCOPES.
    const scopes =
      process.env.YOUTUBE_SCOPES?.trim() ||
      "https://www.googleapis.com/auth/youtube.upload " +
        "https://www.googleapis.com/auth/youtube.readonly " +
        "https://www.googleapis.com/auth/youtube.force-ssl";
    url.searchParams.set("scope", scopes);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", state);
    authUrl = url.toString();
  }

  oauthLog({ flow: platform, step: "connect:redirecting", origin: origin.canonicalOrigin, ...ctx });

  // Same handoff page as the Instagram flow: a provider dialog blocked by a
  // privacy browser or content blocker must explain itself instead of leaving
  // a blank screen. See lib/oauth/interstitial.ts.
  const { locale } = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);
  const response = applyCookies(
    new NextResponse(
      renderOAuthInterstitial({
        authorizeUrl: authUrl,
        provider: PLATFORM_LABELS[platform],
        locale,
        flow: platform,
      }),
      {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store, no-cache, must-revalidate",
        },
      }
    )
  );
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
