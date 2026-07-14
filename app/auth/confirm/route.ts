import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { completePostSignIn } from "@/lib/auth/post-signin";

// Verifies email-template links (password recovery + signup confirmation) via
// token_hash + verifyOtp instead of the PKCE code-exchange /auth/callback
// uses. PKCE ties the link to the browser that *requested* it (a code-verifier
// cookie), which breaks when a reset email is opened on a different device —
// token_hash verification works in any browser and sets the session via
// server cookies here. /auth/callback stays dedicated to Google OAuth.

const VALID_TYPES: EmailOtpType[] = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
];

// Open-redirect guard: only allow same-origin relative paths.
function sanitizeNext(next: string | null): string {
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return "/dashboard";
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const rawType = requestUrl.searchParams.get("type");
  const type = VALID_TYPES.find((t) => t === rawType) ?? null;
  const next = sanitizeNext(requestUrl.searchParams.get("next"));

  const failureUrl = new URL(
    type === "recovery" ? "/forgot-password" : "/login",
    request.url
  );
  failureUrl.searchParams.set("error", type === "recovery" ? "link_expired" : "confirm_failed");

  if (!tokenHash || !type) {
    return NextResponse.redirect(failureUrl);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error || !data.user) {
    console.error("verifyOtp failed", {
      type,
      code: error?.code,
      message: error?.message,
    });
    return NextResponse.redirect(failureUrl);
  }

  if (type === "signup" || type === "email") {
    const postSignInError = await completePostSignIn(supabase, data.user);
    if (postSignInError) {
      const url = new URL("/login", request.url);
      url.searchParams.set("error", postSignInError.code);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.redirect(new URL(next, request.url));
}
