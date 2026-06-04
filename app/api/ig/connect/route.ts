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

  const appId = process.env.META_IG_APP_ID || process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const redirectUri = process.env.META_REDIRECT_URI;
  const scopes = process.env.META_IG_SCOPES?.trim() || "instagram_business_basic";

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