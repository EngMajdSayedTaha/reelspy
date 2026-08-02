import { type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createRouteClient } from "@/lib/supabase/route";
import { relativeRedirect } from "@/lib/http/redirect";
import { createAdminClient } from "@/lib/supabase/admin";
import { track } from "@/lib/analytics/track";
import {
  markWebhookSubscribed,
  storeFacebookUserId,
  storeIgToken,
  storePageCredentials,
} from "@/lib/instagram/token-store";
import { setActiveIgConnection, upsertIgConnection } from "@/lib/instagram/connections";
import {
  exchangeCodeForAccessToken,
  exchangeForLongLivedToken,
  getFacebookUserId,
  getInstagramBusinessAccount,
  parseGraphError,
} from "@/lib/instagram/graph-api";
import { subscribePageToWebhooks } from "@/lib/auto-reply/graph-calls";
import { verifyOAuthState, safeEqual } from "@/lib/oauth/state";
import { oauthLog, oauthError, requestContext } from "@/lib/oauth/log";

const OAUTH_STATE_COOKIE = "reelspy_ig_oauth_state";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const error = requestUrl.searchParams.get("error");
  const state = requestUrl.searchParams.get("state");
  const cookieStore = await cookies();
  const cookieState = cookieStore.get(OAUTH_STATE_COOKIE)?.value ?? null;
  const ctx = requestContext(request);

  if (error) {
    // Facebook's own refusal (user hit Cancel, app not live, scope declined).
    oauthError({
      flow: "ig",
      step: "callback:provider-error",
      providerError: error,
      providerReason: requestUrl.searchParams.get("error_reason"),
      providerDescription: requestUrl.searchParams.get("error_description"),
      ...ctx,
    });
    return relativeRedirect(`/dashboard/connections?error=${encodeURIComponent(error)}`);
  }

  if (!code) {
    oauthError({ flow: "ig", step: "callback:missing-code", ...ctx });
    return relativeRedirect("/dashboard/connections?error=missing_code");
  }

  // Route-handler client: getUser() may refresh + rotate the session on the way
  // back from Facebook. applyCookies carries the refreshed cookies onto every
  // redirect below so mobile users aren't silently bounced to /login (which
  // leaves Instagram unconnected even though OAuth succeeded).
  //
  // Resolved BEFORE the state check (it used to be after) because the state is
  // now bound to a user id and has to be checked against the session that came
  // back — see lib/oauth/state.ts.
  const { supabase, applyCookies } = await createRouteClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    oauthError({ flow: "ig", step: "callback:no-session", hadStateCookie: Boolean(cookieState), ...ctx });
    return applyCookies(relativeRedirect("/login?error=session_expired"));
  }

  // ── State verification ─────────────────────────────────────────────────────
  // Two independent proofs, either of which is sufficient:
  //   * the httpOnly cookie still matches (the classic check), or
  //   * the state carries our HMAC and names THIS user (survives a cookie the
  //     phone dropped between the two hops — the failure this whole change is
  //     about).
  // A cookie miss alone is no longer fatal; a forged or stale state still is.
  const appSecret = process.env.META_APP_SECRET;
  const cookieMatches = Boolean(state && cookieState && safeEqual(state, cookieState));
  const signed =
    state && appSecret ? verifyOAuthState(appSecret, state) : ({ ok: false, reason: "malformed" } as const);
  const signatureMatches = signed.ok && signed.payload.u === user.id;

  if (!cookieMatches && !signatureMatches) {
    const reason = !state
      ? "missing"
      : signed.ok
        ? "user_mismatch"
        : signed.reason;
    oauthError({
      flow: "ig",
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
    flow: "ig",
    step: "callback:state-ok",
    via: cookieMatches ? "cookie" : "signature",
    hadStateCookie: Boolean(cookieState),
    ...ctx,
  });

  try {
    const shortToken = await exchangeCodeForAccessToken(code);
    const { accessToken: longLivedToken, expiresInSeconds } =
      await exchangeForLongLivedToken(shortToken);
    const igAccount = await getInstagramBusinessAccount(longLivedToken);

    if (!igAccount) {
      oauthError({ flow: "ig", step: "callback:no-business-account", ...ctx });
      const noAccountResponse = applyCookies(
        relativeRedirect("/dashboard/connections?error=no_ig_business_account")
      );
      noAccountResponse.cookies.delete(OAUTH_STATE_COOKIE);
      return noAccountResponse;
    }

    const igProfile = { id: igAccount.igUserId, username: igAccount.username };

    const expiresAt = expiresInSeconds
      ? new Date(Date.now() + expiresInSeconds * 1000).toISOString()
      : null;

    // Token writes go through the service-role client: browser-facing roles
    // have no access to the token column (see 20260611_lock_down_ig_tokens.sql).
    const admin = createAdminClient();
    try {
      await storeIgToken(admin, user.id, {
        token: longLivedToken,
        igUserId: igProfile.id,
        username: igProfile.username,
        expiresAt,
      });
    } catch (updateError) {
      console.error("Failed to update profile with IG token", updateError);
      const profileUpdateResponse = applyCookies(
        relativeRedirect("/dashboard/connections?error=profile_update_failed")
      );
      profileUpdateResponse.cookies.delete(OAUTH_STATE_COOKIE);
      return profileUpdateResponse;
    }

    // Record the app-scoped user id so Meta's Deauthorize / Data Deletion
    // callbacks can resolve this account later (they carry no other identifier
    // — see lib/meta/signed-request.ts). Best-effort on both hops: a failure
    // here must never cost the user a working connection.
    try {
      const fbUserId = await getFacebookUserId(longLivedToken);
      if (fbUserId) await storeFacebookUserId(admin, user.id, fbUserId);
    } catch (asidError) {
      console.warn("app-scoped user id capture failed (non-fatal)", asidError);
    }

    // Auto-Reply module: private replies need the PAGE token, and Meta only
    // delivers Instagram webhooks once the page is subscribed to the app.
    // Both are best-effort — a failure must not break the connect flow, the
    // Automations page surfaces a "reconnect" banner instead.
    let webhookWarning: string | null = null;
    let webhookSubscribedAt: string | null = null;
    if (igAccount.pageId && igAccount.pageAccessToken) {
      try {
        await storePageCredentials(admin, user.id, {
          pageId: igAccount.pageId,
          pageName: igAccount.pageName ?? null,
          pageToken: igAccount.pageAccessToken,
        });
        await subscribePageToWebhooks(igAccount.pageId, igAccount.pageAccessToken);
        await markWebhookSubscribed(admin, user.id);
        webhookSubscribedAt = new Date().toISOString();
      } catch (subscribeError) {
        console.error("Auto-reply webhook subscription failed", subscribeError);
        webhookWarning = "webhook_subscribe_failed";
      }
    } else {
      webhookWarning = "page_token_missing";
    }

    // Multi-account (X4): mirror this credential into ig_connections and make it
    // the active research connection. Fail-open — a missing table (pre-migration)
    // just no-ops, and the profiles write above remains the source of truth.
    try {
      const connectionId = await upsertIgConnection(admin, user.id, {
        igUserId: igProfile.id,
        username: igProfile.username,
        token: longLivedToken,
        expiresAt,
        avatarUrl: igAccount.profilePictureUrl ?? null,
        pageId: igAccount.pageId ?? null,
        pageName: igAccount.pageName ?? null,
        pageToken: igAccount.pageAccessToken ?? null,
        webhookSubscribedAt,
      });
      if (connectionId) await setActiveIgConnection(admin, user.id, connectionId);
    } catch (connError) {
      console.error("ig_connections mirror failed (non-fatal)", connError);
    }

    // Note: the connected account is NOT inserted into inspiration_accounts.
    // That table is the user's tracked/competitor list (Accounts page, Feed,
    // plan-limit counts) — the user's own account is a distinct concept,
    // already fully represented by ig_connections/social_connections above.

    // Instrumentation (L5): funnel step after signup.
    await track(user.id, "ig_connected");
    oauthLog({
      flow: "ig",
      step: "callback:connected",
      igUserId: igProfile.id,
      hasPage: Boolean(igAccount.pageId),
      webhookWarning,
      ...ctx,
    });

    const successUrl = new URL("/dashboard/connections?success=connected", request.url);
    if (webhookWarning) {
      successUrl.searchParams.set("warning", webhookWarning);
    }
    const successResponse = applyCookies(relativeRedirect(successUrl));
    successResponse.cookies.delete(OAUTH_STATE_COOKIE);
    return successResponse;
  } catch (callbackError) {
    // Full detail stays in the server logs; the user only sees Meta's
    // user-facing message (never raw API bodies, which can include internal
    // request metadata).
    console.error("Instagram callback failed", callbackError);
    const raw = callbackError instanceof Error ? callbackError.message : String(callbackError);
    const friendly = parseGraphError(raw);
    oauthError({
      flow: "ig",
      step: "callback:exchange-failed",
      // Meta's own message only — never the raw body, which can carry request
      // metadata. The full error is on the console.error line above.
      metaMessage: friendly,
      timedOut: /timed out|aborted|AbortError/i.test(raw),
      ...ctx,
    });
    const target = new URL("/dashboard/connections", request.url);
    target.searchParams.set("error", "oauth_failed");
    if (friendly) {
      target.searchParams.set("detail", friendly.slice(0, 200));
    }
    const failureResponse = applyCookies(relativeRedirect(target));
    failureResponse.cookies.delete(OAUTH_STATE_COOKIE);
    return failureResponse;
  }
}
