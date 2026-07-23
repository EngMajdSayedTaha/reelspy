import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createRouteClient } from "@/lib/supabase/route";
import { buildInstagramConnectUrl } from "@/lib/instagram/graph-api";
import { relativeRedirect } from "@/lib/http/redirect";

const OAUTH_STATE_COOKIE = "reelspy_ig_oauth_state";

export async function GET() {
  // Route-handler client: getUser() may refresh + rotate the session, and we
  // must carry the refreshed cookies onto the redirect below (applyCookies) or
  // mobile users on an expired token get bounced to /login instead of Facebook.
  const { supabase, applyCookies } = await createRouteClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return applyCookies(relativeRedirect("/login"));
  }

  // Facebook Login flow: client_id must be the Facebook App ID.
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const redirectUri = process.env.META_REDIRECT_URI;
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

  if (!appId || !appSecret || !redirectUri) {
    return applyCookies(
      relativeRedirect("/dashboard/connections?error=meta_env_missing")
    );
  }

  const state = randomUUID();
  const redirectResponse = applyCookies(
    NextResponse.redirect(
      buildInstagramConnectUrl({
        appId,
        redirectUri,
        state,
        scopes,
        configId,
      })
    )
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