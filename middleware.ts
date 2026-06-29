import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { authCookieOptions } from "@/lib/supabase/cookie-options";

export async function middleware(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    // Only env-missing routes that actually need auth; never block public pages.
    if (request.nextUrl.pathname.startsWith("/dashboard")) {
      return NextResponse.redirect(new URL("/login?error=supabase_env_missing", request.url));
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

  if (!user && request.nextUrl.pathname.startsWith("/dashboard")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return supabaseResponse;
}

export const config = {
  // Run on page navigations (everything except API routes, static assets and
  // image optimization) so the session cookie is refreshed/re-extended wherever
  // the user lands — not only under /dashboard. This is what keeps mobile
  // signed in between visits. API routes are excluded on purpose: cron and
  // webhook endpoints authenticate with their own secrets, not user cookies.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
