import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { PREFS_COOKIE, parsePrefs } from "@/lib/prefs";
import { renderOAuthInterstitial } from "@/lib/oauth/interstitial";
import { createRouteClient } from "@/lib/supabase/route";
import { buildInstagramConnectUrl, getMetaRedirectUri } from "@/lib/instagram/graph-api";
import { relativeRedirect } from "@/lib/http/redirect";
import { checkOAuthOrigin } from "@/lib/oauth/origin";
import { issueOAuthState, OAUTH_STATE_TTL_MS } from "@/lib/oauth/state";
import { oauthLog, requestContext } from "@/lib/oauth/log";

// Not exported: Next validates the export surface of a route file, and this is
// duplicated (not imported) in the callback for the same reason.
const OAUTH_STATE_COOKIE = "reelspy_ig_oauth_state";

const CONNECT_PATH = "/api/ig/connect";
const CONNECTIONS = "/dashboard/connections";

export async function GET(request: NextRequest) {
  const ctx = requestContext(request);

  // Facebook Login flow: client_id must be the Facebook App ID.
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  // Defaults to the canonical site origin (app.reelspy.dev) so Facebook returns
  // the user to the real domain, not a stale *.vercel.app host. See
  // getMetaRedirectUri.
  const redirectUri = getMetaRedirectUri();

  if (!appId || !appSecret) {
    oauthLog({ flow: "ig", step: "connect:env-missing", ...ctx });
    return relativeRedirect(`${CONNECTIONS}?error=meta_env_missing`);
  }

  // ── Origin pin ─────────────────────────────────────────────────────────────
  // Must happen BEFORE any cookie is written and before the session is touched:
  // reelspy.dev proxies /api/* to this same deployment, so this handler can run
  // on an origin Facebook will never return to. Cookies written there — the
  // state cookie AND the Supabase session — are simply not sent to the callback,
  // and the user ends up bounced between origins with nothing to show for it.
  // See lib/oauth/origin.ts for the full write-up.
  const origin = checkOAuthOrigin(request, redirectUri, CONNECT_PATH);
  if (origin.pinned) {
    oauthLog({
      flow: "ig",
      step: "connect:origin-pinned",
      from: origin.requestOrigin,
      to: origin.canonicalOrigin,
      ...ctx,
    });
    // 307 keeps this a plain GET and stays uncached, so a later fix to the
    // canonical origin takes effect immediately instead of being replayed from
    // a browser cache.
    return NextResponse.redirect(origin.redirectTo, 307);
  }

  // Route-handler client: getUser() may refresh + rotate the session, and we
  // must carry the refreshed cookies onto the redirect below (applyCookies) or
  // mobile users on an expired token get bounced to /login instead of Facebook.
  const { supabase, applyCookies } = await createRouteClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Reached only when the session is genuinely gone (expired refresh token),
    // now that the origin is pinned. Say so on the login screen instead of
    // dropping the user on a bare /login with no explanation.
    oauthLog({ flow: "ig", step: "connect:no-session", ...ctx });
    return applyCookies(relativeRedirect("/login?error=session_expired"));
  }

  // The last four scopes power the Auto-Reply module (comment replies, private
  // reply DMs, page webhook subscription). NOTE: META_IG_SCOPES overrides this
  // list, and with META_FB_CONFIG_ID the permissions come from the Facebook
  // Login for Business configuration in the Meta dashboard instead.
  // The last two scopes power the Publishing module (Reels content publishing +
  // Facebook Page video posts); the four before them power Auto-Reply.
  const scopes =
    process.env.META_IG_SCOPES?.trim() ||
    "instagram_basic,pages_show_list,pages_read_engagement,business_management,instagram_manage_insights," +
      "instagram_manage_comments,instagram_manage_messages,pages_manage_metadata,pages_messaging," +
      "instagram_content_publish,pages_manage_posts";
  // Facebook Login for Business: when set, permissions come from this configuration.
  const configId = process.env.META_FB_CONFIG_ID?.trim() || undefined;

  // Signed state: verifiable from the query param alone, and bound to this user,
  // so a phone that loses the cookie mid-flow still completes safely.
  const state = issueOAuthState(appSecret, { n: randomUUID(), u: user.id });

  const authorizeUrl = buildInstagramConnectUrl({
    appId,
    redirectUri,
    state,
    scopes,
    configId,
  });

  oauthLog({
    flow: "ig",
    step: "connect:redirecting",
    origin: origin.canonicalOrigin,
    redirectUri,
    usingConfigId: Boolean(configId),
    ...ctx,
  });

  // Hand off from a page we control rather than a bare 307. A privacy browser
  // or content blocker that refuses to load facebook.com otherwise leaves the
  // user on a blank screen with no error and nothing to tap — the exact report
  // that led here, with production logs showing correct redirects and zero
  // callbacks. See lib/oauth/interstitial.ts.
  const { locale } = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);
  const redirectResponse = applyCookies(
    new NextResponse(
      renderOAuthInterstitial({
        authorizeUrl,
        provider: "Facebook",
        locale,
        flow: "ig",
      }),
      {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          // Holds a one-time state; must never be served from a cache.
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
    // Matches the signed state's own TTL. The old 10 minutes expired mid-flow
    // on phones (sign-in + SMS 2FA + Page picker + IG account picker).
    maxAge: OAUTH_STATE_TTL_MS / 1000,
  });

  return redirectResponse;
}
