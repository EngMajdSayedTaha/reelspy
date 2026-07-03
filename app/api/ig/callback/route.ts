import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { track } from "@/lib/analytics/track";
import {
  markWebhookSubscribed,
  storeIgToken,
  storePageCredentials,
} from "@/lib/instagram/token-store";
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
    return NextResponse.redirect(new URL(`/dashboard/connections?error=${error}`, request.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/dashboard/connections?error=missing_code", request.url));
  }

  if (!state || !expectedState || state !== expectedState) {
    const invalidStateResponse = NextResponse.redirect(
      new URL("/dashboard/connections?error=invalid_state", request.url)
    );
    invalidStateResponse.cookies.delete(OAUTH_STATE_COOKIE);
    return invalidStateResponse;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    const shortToken = await exchangeCodeForAccessToken(code);
    const { accessToken: longLivedToken, expiresInSeconds } =
      await exchangeForLongLivedToken(shortToken);
    const igAccount = await getInstagramBusinessAccount(longLivedToken);

    if (!igAccount) {
      const noAccountResponse = NextResponse.redirect(
        new URL("/dashboard/connections?error=no_ig_business_account", request.url)
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
      const profileUpdateResponse = NextResponse.redirect(
        new URL("/dashboard/connections?error=profile_update_failed", request.url)
      );
      profileUpdateResponse.cookies.delete(OAUTH_STATE_COOKIE);
      return profileUpdateResponse;
    }

    // Auto-Reply module: private replies need the PAGE token, and Meta only
    // delivers Instagram webhooks once the page is subscribed to the app.
    // Both are best-effort — a failure must not break the connect flow, the
    // Automations page surfaces a "reconnect" banner instead.
    let webhookWarning: string | null = null;
    if (igAccount.pageId && igAccount.pageAccessToken) {
      try {
        await storePageCredentials(admin, user.id, {
          pageId: igAccount.pageId,
          pageName: igAccount.pageName ?? null,
          pageToken: igAccount.pageAccessToken,
        });
        await subscribePageToWebhooks(igAccount.pageId, igAccount.pageAccessToken);
        await markWebhookSubscribed(admin, user.id);
      } catch (subscribeError) {
        console.error("Auto-reply webhook subscription failed", subscribeError);
        webhookWarning = "webhook_subscribe_failed";
      }
    } else {
      webhookWarning = "page_token_missing";
    }

    const { error: accountError } = await supabase.from("inspiration_accounts").upsert(
      {
        user_id: user.id,
        ig_username: igProfile.username,
        display_name: igProfile.username,
        is_active: true,
      },
      { onConflict: "user_id,ig_username" }
    );

    if (accountError) {
      console.error("Failed to create connected IG account row", accountError);
      const accountResponse = NextResponse.redirect(
        new URL("/dashboard/connections?error=account_link_failed", request.url)
      );
      accountResponse.cookies.delete(OAUTH_STATE_COOKIE);
      return accountResponse;
    }

    // Instrumentation (L5): funnel step after signup.
    await track(user.id, "ig_connected");

    const successUrl = new URL("/dashboard/connections?success=connected", request.url);
    if (webhookWarning) {
      successUrl.searchParams.set("warning", webhookWarning);
    }
    const successResponse = NextResponse.redirect(successUrl);
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
    const failureResponse = NextResponse.redirect(target);
    failureResponse.cookies.delete(OAUTH_STATE_COOKIE);
    return failureResponse;
  }
}
