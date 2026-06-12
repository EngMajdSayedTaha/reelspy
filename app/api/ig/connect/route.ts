import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildInstagramConnectUrl } from "@/lib/instagram/graph-api";

const OAUTH_STATE_COOKIE = "reelspy_ig_oauth_state";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Facebook Login flow: client_id must be the Facebook App ID.
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const redirectUri = process.env.META_REDIRECT_URI;
  // The last four scopes power the Auto-Reply module (comment replies, private
  // reply DMs, page webhook subscription). NOTE: META_IG_SCOPES overrides this
  // list, and with META_FB_CONFIG_ID the permissions come from the Facebook
  // Login for Business configuration in the Meta dashboard instead.
  const scopes =
    process.env.META_IG_SCOPES?.trim() ||
    "instagram_basic,pages_show_list,pages_read_engagement,business_management,instagram_manage_insights," +
      "instagram_manage_comments,instagram_manage_messages,pages_manage_metadata,pages_messaging";
  // Facebook Login for Business: when set, permissions come from this configuration.
  const configId = process.env.META_FB_CONFIG_ID?.trim() || undefined;

  if (!appId || !appSecret || !redirectUri) {
    return NextResponse.redirect(
      new URL("/dashboard/settings/instagram?error=meta_env_missing", request.url)
    );
  }

  const state = randomUUID();
  const redirectResponse = NextResponse.redirect(
    buildInstagramConnectUrl({
      appId,
      redirectUri,
      state,
      scopes,
      configId,
    })
  );

  redirectResponse.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  });

  return redirectResponse;
}