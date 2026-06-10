import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import {
  exchangeCodeForAccessToken,
  exchangeForLongLivedToken,
  getInstagramBusinessAccount,
} from "@/lib/instagram/graph-api";

const OAUTH_STATE_COOKIE = "reelspy_ig_oauth_state";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const error = requestUrl.searchParams.get("error");
  const state = requestUrl.searchParams.get("state");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(OAUTH_STATE_COOKIE)?.value;

  if (error) {
    return NextResponse.redirect(new URL(`/dashboard/settings/instagram?error=${error}`, request.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/dashboard/settings/instagram?error=missing_code", request.url));
  }

  if (!state || !expectedState || state !== expectedState) {
    const invalidStateResponse = NextResponse.redirect(
      new URL("/dashboard/settings/instagram?error=invalid_state", request.url)
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
        new URL("/dashboard/settings/instagram?error=no_ig_business_account", request.url)
      );
      noAccountResponse.cookies.delete(OAUTH_STATE_COOKIE);
      return noAccountResponse;
    }

    const igProfile = { id: igAccount.igUserId, username: igAccount.username };

    const expiresAt = expiresInSeconds
      ? new Date(Date.now() + expiresInSeconds * 1000).toISOString()
      : null;

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        ig_access_token: longLivedToken,
        ig_user_id: igProfile.id,
        username: igProfile.username,
        ig_token_expires_at: expiresAt,
        ig_token_status: "active",
        ig_token_refreshed_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (updateError) {
      console.error("Failed to update profile with IG token", updateError);
      const profileUpdateResponse = NextResponse.redirect(
        new URL("/dashboard/settings/instagram?error=profile_update_failed", request.url)
      );
      profileUpdateResponse.cookies.delete(OAUTH_STATE_COOKIE);
      return profileUpdateResponse;
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
        new URL("/dashboard/settings/instagram?error=account_link_failed", request.url)
      );
      accountResponse.cookies.delete(OAUTH_STATE_COOKIE);
      return accountResponse;
    }

    const successResponse = NextResponse.redirect(
      new URL("/dashboard/settings/instagram?success=connected", request.url)
    );
    successResponse.cookies.delete(OAUTH_STATE_COOKIE);
    return successResponse;
  } catch (callbackError) {
    console.error("Instagram callback failed", callbackError);
    // Surface the real Meta error so the user can see what went wrong.
    const detail =
      callbackError instanceof Error ? callbackError.message : String(callbackError);
    const target = new URL("/dashboard/settings/instagram", request.url);
    target.searchParams.set("error", "oauth_failed");
    target.searchParams.set("detail", detail.slice(0, 300));
    const failureResponse = NextResponse.redirect(target);
    failureResponse.cookies.delete(OAUTH_STATE_COOKIE);
    return failureResponse;
  }
}
