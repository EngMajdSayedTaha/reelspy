import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { PREFS_COOKIE, parsePrefs } from "@/lib/prefs";
import { renderOAuthInterstitial } from "@/lib/oauth/interstitial";
import { createRouteClient } from "@/lib/supabase/route";
import { buildInstagramLoginConnectUrl, getInstagramLoginRedirectUri } from "@/lib/instagram/login-api";
import { relativeRedirect } from "@/lib/http/redirect";
import { checkOAuthOrigin } from "@/lib/oauth/origin";
import { issueOAuthState, OAUTH_STATE_TTL_MS } from "@/lib/oauth/state";
import { oauthLog, requestContext } from "@/lib/oauth/log";

// Not exported: Next validates the export surface of a route file, and this is
// duplicated (not imported) in the callback for the same reason.
const OAUTH_STATE_COOKIE = "reelspy_ig_login_oauth_state";

const CONNECT_PATH = "/api/ig/login/connect";
const CONNECTIONS = "/dashboard/connections";

// Instagram Login — the direct-to-Instagram alternative to /api/ig/connect
// (Facebook Login for Business). Same shape as that route (origin pin, signed
// state, interstitial handoff) but talks to www.instagram.com instead of
// facebook.com and needs no Facebook Page. See lib/instagram/login-api.ts.
export async function GET(request: NextRequest) {
  const ctx = requestContext(request);

  const appId = process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  const redirectUri = getInstagramLoginRedirectUri();

  if (!appId || !appSecret) {
    oauthLog({ flow: "ig_login", step: "connect:env-missing", ...ctx });
    return relativeRedirect(`${CONNECTIONS}?error=instagram_login_env_missing`);
  }

  // ── Origin pin ─────────────────────────────────────────────────────────────
  // Same reasoning as /api/ig/connect: must happen before any cookie is written.
  // See lib/oauth/origin.ts.
  const origin = checkOAuthOrigin(request, redirectUri, CONNECT_PATH);
  if (origin.pinned) {
    oauthLog({
      flow: "ig_login",
      step: "connect:origin-pinned",
      from: origin.requestOrigin,
      to: origin.canonicalOrigin,
      ...ctx,
    });
    return NextResponse.redirect(origin.redirectTo, 307);
  }

  const { supabase, applyCookies } = await createRouteClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    oauthLog({ flow: "ig_login", step: "connect:no-session", ...ctx });
    return applyCookies(relativeRedirect("/login?error=session_expired"));
  }

  // Instagram API with Instagram Login's scope names — a different family from
  // the Facebook Login flow's (instagram_basic, pages_show_list, …). Covers the
  // creator's own profile/media/insights, comment replies, and Content
  // Publishing. There is no Page, so no pages_* or *_messaging scope applies.
  const scopes =
    process.env.INSTAGRAM_LOGIN_SCOPES?.trim() ||
    "instagram_business_basic,instagram_business_content_publish," +
      "instagram_business_manage_comments,instagram_business_manage_messages";

  const state = issueOAuthState(appSecret, { n: randomUUID(), u: user.id });

  const authorizeUrl = buildInstagramLoginConnectUrl({
    appId,
    redirectUri,
    state,
    scopes,
  });

  oauthLog({
    flow: "ig_login",
    step: "connect:redirecting",
    origin: origin.canonicalOrigin,
    redirectUri,
    appId,
    authorizeUrl: authorizeUrl.replace(/([?&]state=)[^&]*/, "$1REDACTED"),
    ...ctx,
  });

  const { locale } = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);
  const redirectResponse = applyCookies(
    new NextResponse(
      renderOAuthInterstitial({
        authorizeUrl,
        provider: "Instagram",
        locale,
        flow: "ig_login",
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

  redirectResponse.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: OAUTH_STATE_TTL_MS / 1000,
  });

  return redirectResponse;
}
