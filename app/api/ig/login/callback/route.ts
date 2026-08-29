import { type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createRouteClient } from "@/lib/supabase/route";
import { relativeRedirect } from "@/lib/http/redirect";
import { createAdminClient } from "@/lib/supabase/admin";
import { track } from "@/lib/analytics/track";
import { storeIgToken } from "@/lib/instagram/token-store";
import { setActiveIgConnection, upsertIgConnection } from "@/lib/instagram/connections";
import {
  exchangeForLongLivedInstagramToken,
  exchangeInstagramLoginCode,
  getInstagramLoginProfile,
} from "@/lib/instagram/login-api";
import { parseGraphError } from "@/lib/instagram/graph-api";
import { verifyOAuthState, safeEqual } from "@/lib/oauth/state";
import { oauthLog, oauthError, requestContext } from "@/lib/oauth/log";

const OAUTH_STATE_COOKIE = "reelspy_ig_login_oauth_state";

// The `instagram_business_*` permissions this flow requests are at Standard
// Access until App Review grants Advanced Access, so Graph only serves them to
// users who hold a role (admin / developer / tester) on the Meta app. A
// role-less user's token exchange / profile read comes back not as a clean
// "permission denied" but as Meta's catch-all
//   IGApiException code 100 "Unsupported request - method type: get"
// — deterministic, never transient, so "please try again" is the wrong copy.
// Route it to a message that names the real fix instead.
function isIgLoginAccessError(raw: string): boolean {
  return (
    (/"code":\s*100\b/.test(raw) && /IGApiException/i.test(raw)) ||
    /unsupported request\b[^"]*method type/i.test(raw) ||
    /does not have permission|has not been granted|requires .*permission/i.test(raw)
  );
}

// Callback for the direct Instagram Login flow — no Facebook Page, no ASID,
// no Page webhook subscription. See /api/ig/login/connect for the authorize
// step and lib/instagram/login-api.ts for the Graph calls.
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const error = requestUrl.searchParams.get("error");
  const state = requestUrl.searchParams.get("state");
  const cookieStore = await cookies();
  const cookieState = cookieStore.get(OAUTH_STATE_COOKIE)?.value ?? null;
  const ctx = requestContext(request);

  if (error) {
    oauthError({
      flow: "ig_login",
      step: "callback:provider-error",
      providerError: error,
      providerReason: requestUrl.searchParams.get("error_reason"),
      providerDescription: requestUrl.searchParams.get("error_description"),
      ...ctx,
    });
    return relativeRedirect(`/dashboard/connections?error=${encodeURIComponent(error)}`);
  }

  if (!code) {
    oauthError({ flow: "ig_login", step: "callback:missing-code", ...ctx });
    return relativeRedirect("/dashboard/connections?error=missing_code");
  }

  const { supabase, applyCookies } = await createRouteClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    oauthError({
      flow: "ig_login",
      step: "callback:no-session",
      hadStateCookie: Boolean(cookieState),
      ...ctx,
    });
    return applyCookies(relativeRedirect("/login?error=session_expired"));
  }

  // ── State verification — same two-proof scheme as /api/ig/callback, keyed
  // on INSTAGRAM_APP_SECRET (this flow's own server secret) instead of
  // META_APP_SECRET. See lib/oauth/state.ts.
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  const cookieMatches = Boolean(state && cookieState && safeEqual(state, cookieState));
  const signed =
    state && appSecret ? verifyOAuthState(appSecret, state) : ({ ok: false, reason: "malformed" } as const);
  const signatureMatches = signed.ok && signed.payload.u === user.id;

  if (!cookieMatches && !signatureMatches) {
    const reason = !state ? "missing" : signed.ok ? "user_mismatch" : signed.reason;
    oauthError({
      flow: "ig_login",
      step: "callback:invalid-state",
      reason,
      hadStateCookie: Boolean(cookieState),
      ...ctx,
    });
    const invalidStateResponse = applyCookies(
      relativeRedirect(
        `/dashboard/connections?error=${reason === "expired" ? "state_expired" : "invalid_state"}`
      )
    );
    invalidStateResponse.cookies.delete(OAUTH_STATE_COOKIE);
    return invalidStateResponse;
  }

  oauthLog({
    flow: "ig_login",
    step: "callback:state-ok",
    via: cookieMatches ? "cookie" : "signature",
    hadStateCookie: Boolean(cookieState),
    ...ctx,
  });

  try {
    const { accessToken: shortToken } = await exchangeInstagramLoginCode(code);
    const { accessToken: longLivedToken, expiresInSeconds } =
      await exchangeForLongLivedInstagramToken(shortToken);
    const profile = await getInstagramLoginProfile(longLivedToken);

    if (!profile.igUserId) {
      oauthError({ flow: "ig_login", step: "callback:no-profile", ...ctx });
      const failed = applyCookies(relativeRedirect("/dashboard/connections?error=oauth_failed"));
      failed.cookies.delete(OAUTH_STATE_COOKIE);
      return failed;
    }

    // Meta only grants the business_* scopes this flow requests to Business or
    // Creator accounts — a Personal account should never reach here — but the
    // account_type is cheap to double-check and gives a precise error instead
    // of a confusing downstream Graph failure if it somehow does.
    const accountType = profile.accountType?.toUpperCase();
    if (accountType && accountType !== "BUSINESS" && accountType !== "CREATOR" && accountType !== "MEDIA_CREATOR") {
      oauthError({ flow: "ig_login", step: "callback:not-professional", accountType, ...ctx });
      const notPro = applyCookies(
        relativeRedirect("/dashboard/connections?error=ig_login_needs_professional_account")
      );
      notPro.cookies.delete(OAUTH_STATE_COOKIE);
      return notPro;
    }

    const expiresAt = expiresInSeconds
      ? new Date(Date.now() + expiresInSeconds * 1000).toISOString()
      : null;

    const admin = createAdminClient();
    try {
      await storeIgToken(admin, user.id, {
        token: longLivedToken,
        igUserId: profile.igUserId,
        username: profile.username,
        expiresAt,
        authFlow: "instagram_login",
      });
    } catch (updateError) {
      console.error("Failed to update profile with Instagram Login token", updateError);
      const profileUpdateResponse = applyCookies(
        relativeRedirect("/dashboard/connections?error=profile_update_failed")
      );
      profileUpdateResponse.cookies.delete(OAUTH_STATE_COOKIE);
      return profileUpdateResponse;
    }

    // Multi-account (X4): same mirror as the Facebook-Login callback, minus the
    // Page fields — there is no Page in this flow. Fail-open pre-migration.
    try {
      const connectionId = await upsertIgConnection(admin, user.id, {
        igUserId: profile.igUserId,
        username: profile.username,
        token: longLivedToken,
        expiresAt,
        avatarUrl: profile.profilePictureUrl ?? null,
        authFlow: "instagram_login",
      });
      if (connectionId) await setActiveIgConnection(admin, user.id, connectionId);
    } catch (connError) {
      console.error("ig_connections mirror failed (non-fatal)", connError);
    }

    await track(user.id, "ig_connected", { auth_flow: "instagram_login" });
    oauthLog({
      flow: "ig_login",
      step: "callback:connected",
      igUserId: profile.igUserId,
      ...ctx,
    });

    const successUrl = new URL("/dashboard/connections?success=connected", request.url);
    const successResponse = applyCookies(relativeRedirect(successUrl));
    successResponse.cookies.delete(OAUTH_STATE_COOKIE);
    return successResponse;
  } catch (callbackError) {
    console.error("Instagram Login callback failed", callbackError);
    const raw = callbackError instanceof Error ? callbackError.message : String(callbackError);
    const friendly = parseGraphError(raw);
    const accessError = isIgLoginAccessError(raw);
    oauthError({
      flow: "ig_login",
      step: "callback:exchange-failed",
      metaMessage: friendly,
      accessError,
      timedOut: /timed out|aborted|AbortError/i.test(raw),
      ...ctx,
    });
    const target = new URL("/dashboard/connections", request.url);
    if (accessError) {
      // Not a retry situation and not something to paste Meta's raw string
      // for — the account simply isn't allowed through this flow yet.
      target.searchParams.set("error", "ig_login_not_available");
    } else {
      target.searchParams.set("error", "oauth_failed");
      if (friendly) {
        target.searchParams.set("detail", friendly.slice(0, 200));
      }
    }
    const failureResponse = applyCookies(relativeRedirect(target));
    failureResponse.cookies.delete(OAUTH_STATE_COOKIE);
    return failureResponse;
  }
}
