import { type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createRouteClient } from "@/lib/supabase/route";
import { relativeRedirect } from "@/lib/http/redirect";
import { createAdminClient } from "@/lib/supabase/admin";
import { track } from "@/lib/analytics/track";
import {
  markWebhookSubscribed,
  storeIgToken,
  storePageCredentials,
} from "@/lib/instagram/token-store";
import { setActiveIgConnection, upsertIgConnection } from "@/lib/instagram/connections";
import {
  exchangeCodeForAccessToken,
  exchangeForLongLivedToken,
  getInstagramBusinessAccount,
  parseGraphError,
} from "@/lib/instagram/graph-api";
import { subscribePageToWebhooks } from "@/lib/auto-reply/graph-calls";

const OAUTH_STATE_COOKIE = "reelspy_ig_oauth_state";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const error = requestUrl.searchParams.get("error");
  const state = requestUrl.searchParams.get("state");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(OAUTH_STATE_COOKIE)?.value;

  if (error) {
    return relativeRedirect(`/dashboard/connections?error=${encodeURIComponent(error)}`);
  }

  if (!code) {
    return relativeRedirect("/dashboard/connections?error=missing_code");
  }

  if (!state || !expectedState || state !== expectedState) {
    const invalidStateResponse = relativeRedirect(
      "/dashboard/connections?error=invalid_state"
    );
    invalidStateResponse.cookies.delete(OAUTH_STATE_COOKIE);
    return invalidStateResponse;
  }

  // Route-handler client: getUser() may refresh + rotate the session on the way
  // back from Facebook. applyCookies carries the refreshed cookies onto every
  // redirect below so mobile users aren't silently bounced to /login (which
  // leaves Instagram unconnected even though OAuth succeeded).
  const { supabase, applyCookies } = await createRouteClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return applyCookies(relativeRedirect("/login"));
  }

  try {
    const shortToken = await exchangeCodeForAccessToken(code);
    const { accessToken: longLivedToken, expiresInSeconds } =
      await exchangeForLongLivedToken(shortToken);
    const igAccount = await getInstagramBusinessAccount(longLivedToken);

    if (!igAccount) {
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
