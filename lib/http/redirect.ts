import { NextResponse, type NextRequest } from "next/server";

/**
 * Builds a redirect whose `Location` is RELATIVE to the origin the browser
 * actually requested, instead of an absolute URL derived from `request.url`.
 *
 * Why this exists
 * ---------------
 * In production the dashboard app is served two ways at once:
 *   1. directly on its own Vercel host (e.g. `reelspy-one.vercel.app`), and
 *   2. through the `reelspy.dev` marketing zone, which proxies every product
 *      route (`/login`, `/auth/*`, `/dashboard`, `/api/*` …) to this deployment.
 *
 * Under the proxy the incoming `Host` header — and therefore `request.url` and
 * `request.nextUrl` — carries the INTERNAL deployment host, not the public
 * `reelspy.dev` the user is looking at. So any redirect built with
 * `new URL(path, request.url)` emits an ABSOLUTE `Location` pointing at the
 * internal host, which yanks the user off `reelspy.dev` and onto
 * `reelspy-one.vercel.app`. The most visible case is right after Google
 * sign-in: `/auth/callback` would send the freshly-authenticated user to
 * `https://reelspy-one.vercel.app/dashboard`.
 *
 * A relative `Location` sidesteps host resolution entirely: the browser
 * resolves it against whatever URL is in the address bar — `reelspy.dev`, a
 * Vercel preview URL, or `localhost` — so the user always lands back on the
 * exact origin they came in on. This is intentionally origin-agnostic; it needs
 * no env var, no `x-forwarded-host` sniffing, and no allow-list of hosts.
 *
 * Note: `NextResponse.redirect()` rejects relative URLs, which is exactly why
 * this constructs the response by hand. The returned `NextResponse` still
 * supports `.cookies.set()/.delete()` so callers can carry refreshed session
 * cookies onto the redirect as before.
 *
 * @param target Either a path string (`"/dashboard?x=1"`) or a `URL` whose
 *   `pathname + search` is kept and whose origin is deliberately discarded.
 *   This lets callers keep building URLs with `new URL(path, request.url)` +
 *   `searchParams` and simply hand the result here.
 * @param status 307 (default, preserves method) or 303 (force GET after POST).
 */
export function relativeRedirect(
  target: string | URL,
  status: 303 | 307 = 307
): NextResponse {
  const raw = typeof target === "string" ? target : target.pathname + target.search;
  // Open-redirect guard: only same-origin relative paths — never a
  // protocol-relative `//evil.com` or an absolute `https://…`.
  const safe = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard";
  return new NextResponse(null, { status, headers: { Location: safe } });
}

/**
 * Redirect helper for EDGE MIDDLEWARE. Use this — NOT `relativeRedirect` — from
 * `middleware.ts`.
 *
 * Why middleware needs its own helper
 * -----------------------------------
 * `relativeRedirect` emits a RELATIVE `Location` header, which is correct for
 * Route Handlers (the browser resolves it against the address-bar origin). But
 * it is FATAL in middleware: Next's edge adapter post-processes every middleware
 * response by running `new NextURL(response.headers.get("Location"), opts)`
 * (next/dist/.../server/web/adapter.js). It passes an options object as the
 * second argument — never a base — so a relative Location degenerates to
 * `new URL("/login")`, which throws `TypeError: Invalid URL`. That unhandled
 * throw 500s EVERY middleware redirect: a signed-in visitor on /login|/signup|/
 * (→ /dashboard) and a signed-out visitor on /dashboard (→ /login) — i.e. the
 * whole auth surface, including the marketing site's Login/Sign-up buttons.
 *
 * The fix
 * -------
 * Hand the adapter an ABSOLUTE URL built on the request's OWN origin. The
 * adapter rewrites a same-host redirect `Location` back to a relative one (see
 * `getRelativeURL` in adapter.js), so the browser still stays on whatever public
 * origin it came in on (reelspy.dev under the marketing-zone proxy) and the
 * internal deployment host never leaks. Building against `request.url` — the
 * server-known origin — rather than a client-supplied `x-forwarded-host` also
 * avoids a Host-header open-redirect.
 *
 * @param request The incoming middleware request (its origin is the base).
 * @param path Same-origin path (`"/login"`, `"/login?error=x"`). Anything that
 *   isn't a plain `/...` path falls back to `/dashboard` (open-redirect guard).
 * @param status 307 (default, preserves method) or 303 (force GET after POST).
 */
export function middlewareRedirect(
  request: NextRequest,
  path: string,
  status: 303 | 307 = 307
): NextResponse {
  const safe = path.startsWith("/") && !path.startsWith("//") ? path : "/dashboard";
  return NextResponse.redirect(new URL(safe, request.url), status);
}
