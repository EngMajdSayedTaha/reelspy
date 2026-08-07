import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { authCookieOptions } from "@/lib/supabase/cookie-options";
import { middlewareRedirect } from "@/lib/http/redirect";

// A present-but-malformed NEXT_PUBLIC_SUPABASE_URL (missing scheme, stray
// whitespace/quote, placeholder) passes a truthiness check but makes the
// Supabase client constructor throw `TypeError: Invalid URL`. In edge
// middleware that unhandled throw 500s EVERY page it runs on — /login and
// /signup included — so a bad env var takes the whole auth surface down.
// Validate up front and treat an invalid value exactly like a missing one:
// degrade gracefully instead of hard-crashing.
function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!supabaseUrl || !supabaseAnonKey || !isValidHttpUrl(supabaseUrl)) {
    // Only env-missing routes that actually need auth; never block public pages.
    if (request.nextUrl.pathname.startsWith("/dashboard")) {
      return middlewareRedirect(request, "/login?error=supabase_env_missing");
    }
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: authCookieOptions,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          // Re-issue the auth cookies from the SERVER with our durable maxAge.
          // Server Set-Cookie headers are exempt from the iOS Safari ITP cap
          // that shortens JS-written cookies, so running this on every app
          // navigation keeps the session alive on mobile across deploys.
          supabaseResponse.cookies.set(name, value, { ...authCookieOptions, ...options })
        );
      },
    },
  });

  // getUser() validates the session and, when the access token is expired,
  // transparently refreshes it using the refresh token — which triggers the
  // setAll above and re-extends the cookie lifetime on this response.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Redirects below swap in a fresh NextResponse.redirect, which would
  // otherwise drop the refreshed session cookies just set on
  // supabaseResponse above. Carry them over so a token refresh survives the
  // redirect instead of getting silently discarded.
  // middlewareRedirect (NOT relativeRedirect) builds an absolute Location on
  // this request's origin, which the edge adapter rewrites to relative — so the
  // redirect stays on whatever public origin the request arrived on
  // (app.reelspy.dev directly, or reelspy.dev for the paths it still proxies)
  // without the internal host leaking, AND without the `TypeError: Invalid URL`
  // that a relative Location triggers inside the adapter. See lib/http/redirect.ts.
  const redirect = (path: string) => {
    const response = middlewareRedirect(request, path);
    supabaseResponse.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
    return response;
  };

  // "/" and "/login" previously redirected/rendered unconditionally, even for
  // an already-signed-in visitor. On mobile, opening a new tab reloads from
  // the bookmarked/home-screen URL (almost always "/"), so a fully valid
  // session cookie was landing back on the login screen every time. The user
  // then had no choice but to tap "Continue with Google", which forces a full
  // Google consent screen (app/login/page.tsx requests prompt=consent) even
  // though they were never actually logged out. Route an authenticated
  // visitor straight to the dashboard instead of back through login.
  if (
    user &&
    (request.nextUrl.pathname === "/" ||
      request.nextUrl.pathname === "/login" ||
      request.nextUrl.pathname === "/signup")
  ) {
    return redirect("/dashboard");
  }

  if (!user && request.nextUrl.pathname === "/") {
    return redirect("/login");
  }

  if (!user && request.nextUrl.pathname.startsWith("/dashboard")) {
    return redirect("/login");
  }

  // Admin-forced password reset gate: a flagged user must set a new password
  // before touching the product surface, even with an otherwise-valid
  // session — GoTrue exposes no way to revoke an arbitrary user's still-valid
  // access token, so this DB check (not token expiry) is what actually
  // enforces "reset before continuing" on their very next navigation. Scoped
  // to /dashboard only (not /admin) so an admin who force-resets themselves
  // — e.g. as part of "reset all" — isn't locked out of the admin panel they'd
  // need to fix things. See app/api/admin/users/[id]/force-reset/route.ts.
  if (user && request.nextUrl.pathname.startsWith("/dashboard")) {
    try {
      const { data } = await supabase
        .from("profiles")
        .select("force_password_reset")
        .eq("id", user.id)
        .maybeSingle();
      if (data?.force_password_reset) {
        return redirect("/reset-password?forced=1");
      }
    } catch {
      // Fail open here — this is a UX nudge on top of the real security
      // boundary (the session-revocation RPC), not the boundary itself.
    }
  }

  // A password-recovery link signs the user in (verifyOtp sets a session) so
  // they can set a new password — that IS a signed-in session, so /login and
  // /signup redirecting signed-in users away must not also apply here.
  // Visiting /reset-password signed-out (no recovery session, e.g. an expired
  // or already-used link) has nothing to reset against — send them back to
  // request a fresh one.
  if (!user && request.nextUrl.pathname === "/reset-password") {
    return redirect("/forgot-password?error=link_expired");
  }

  // Admin surface gate (belt; app/admin/layout.tsx is authoritative). A
  // signed-out visitor goes to login; a signed-in non-admin gets a rewrite to
  // 404 so the admin area is invisible (never a redirect that would hint the
  // path exists). is_admin is readable by the authenticated role via the
  // column grant (see migration profile_is_admin), so the anon-key middleware
  // client can check it. Fails closed on any error.
  if (request.nextUrl.pathname.startsWith("/admin")) {
    if (!user) return redirect("/login");
    let isAdmin = false;
    try {
      const { data } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", user.id)
        .maybeSingle();
      isAdmin = data?.is_admin === true;
    } catch {
      isAdmin = false;
    }
    if (!isAdmin) {
      return NextResponse.rewrite(new URL("/404", request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  // Run on page navigations (everything except API routes, static assets and
  // image optimization) so the session cookie is refreshed/re-extended wherever
  // the user lands — not only under /dashboard. This is what keeps mobile
  // signed in between visits. API routes are excluded on purpose: cron and
  // webhook endpoints authenticate with their own secrets, not user cookies.
  // dashboard-static is excluded because the exclusions below are anchored at
  // the start of the path: /dashboard-static/_next/static/* does NOT match the
  // "_next/static" alternative, so without this the session check would treat
  // every proxied asset as an unknown page and redirect it to /login.
  matcher: ["/((?!api|dashboard-static|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
