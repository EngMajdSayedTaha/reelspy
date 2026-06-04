import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import {
  exchangeCodeForAccessToken,
  exchangeForLongLivedToken,
  getMyProfile,
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
    const longLivedToken = await exchangeForLongLivedToken(shortToken.accessToken);
    const igProfile = await getMyProfile(shortToken.igUserId, longLivedToken);

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        ig_access_token: longLivedToken,
        ig_user_id: igProfile.id,
        username: igProfile.username,
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
    const failureResponse = NextResponse.redirect(
      new URL("/dashboard/settings/instagram?error=oauth_failed", request.url)
    );
    failureResponse.cookies.delete(OAUTH_STATE_COOKIE);
    return failureResponse;
  }
}
