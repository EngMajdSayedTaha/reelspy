import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { authCookieOptions } from "./cookie-options";

// Supabase client for OAuth Route Handlers (the /api/*/connect + /callback
// endpoints).
//
// Why this exists — and why the plain `createClient()` isn't enough here:
// getUser() transparently refreshes an expired access token, and Supabase
// ROTATES the refresh token on every refresh. The new tokens are written back
// through setAll(). But these routes finish by returning a *fresh*
// NextResponse.redirect(...) — Facebook, then back to /dashboard — and a fresh
// response drops any cookies set via next/headers, exactly like the redirects
// the middleware guards against. If the rotated cookies never reach the
// browser, it keeps sending the OLD (now-invalidated) refresh token, so the
// NEXT hop's getUser() returns null and the user is bounced to /login instead
// of through OAuth.
//
// On desktop the access token is usually still valid at connect time, so no
// refresh/rotation happens and the drop is invisible. On mobile — where iOS
// Safari ITP shortens the auth cookie and backgrounded tabs go stale (see
// cookie-options.ts) — the token is routinely expired, the refresh fires, and
// the connect flow silently dies. applyCookies() carries the refreshed session
// cookies onto whatever redirect the handler returns so the rotation survives.
export async function createRouteClient() {
  const cookieStore = await cookies();
  const pending: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: authCookieOptions,
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            const merged = { ...authCookieOptions, ...options };
            pending.push({ name, value, options: merged });
            try {
              cookieStore.set(name, value, merged);
            } catch {
              // no-op if the store is read-only in this context
            }
          });
        },
      },
    }
  );

  // Re-apply Supabase's refreshed/rotated session cookies onto an outgoing
  // redirect so a token refresh survives the fresh response.
  const applyCookies = <T extends NextResponse>(response: T): T => {
    for (const { name, value, options } of pending) {
      response.cookies.set(name, value, options);
    }
    return response;
  };

  return { supabase, applyCookies };
}
