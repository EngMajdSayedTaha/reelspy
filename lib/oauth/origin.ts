// Origin pinning for OAuth round-trips.
//
// THE PROBLEM THIS SOLVES
// ----------------------
// The product moved to its own origin (app.reelspy.dev) on 2026-07-25, but
// reelspy.dev still PROXIES `/api/:path*` to this same deployment (see
// docs/domain-migration.md). So `/api/ig/connect` answers on *both* origins,
// while the provider always returns the user to ONE fixed origin — whatever
// `getMetaRedirectUri()` / `getSocialRedirectUri()` resolves to, because that
// exact string is what's registered in the Meta/TikTok/Google console.
//
// When the user starts the flow on a different origin than the one the provider
// returns to, two cookies are silently lost on the way back:
//
//   1. the `reelspy_*_oauth_state` CSRF cookie  → callback fails `invalid_state`
//   2. the Supabase session cookie             → callback sees no user → /login
//
// …and on the marketing origin `/login` is itself a 307 back to app.reelspy.dev,
// where the middleware sees a valid session and bounces to /dashboard. The user
// experiences that as a tab that spins and lands nowhere — never an error.
//
// This is entry-point dependent, not device dependent, which is why it shows up
// on phones: the home-screen icon and old bookmarks still point at reelspy.dev,
// while a desktop that was set up after the migration goes straight to
// app.reelspy.dev and never crosses an origin.
//
// THE FIX
// -------
// Before any cookie is written, bounce the request to the canonical origin's
// own connect endpoint. Everything after that — state cookie, provider consent,
// callback, session — happens on one origin, so nothing can be dropped.
//
// The redirect target is a CONSTANT derived from server config, never from a
// client-supplied header, so this cannot be turned into an open redirect.

/** Origin (`https://host[:port]`) of an absolute URL, or null if unparseable. */
export function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * The public origin the browser actually requested, as opposed to
 * `request.url`, which under a proxy carries the INTERNAL deployment host.
 *
 * Only ever compared against a server-side constant — never used to build a
 * redirect target — so a spoofed `x-forwarded-host` can't redirect anyone
 * anywhere. The worst a forged header achieves is skipping the bounce.
 */
export function requestPublicOrigin(request: Request): string | null {
  const headers = request.headers;
  const forwardedHost = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || headers.get("host")?.trim();
  if (!host) return originOf(request.url);
  const proto =
    headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return originOf(`${proto}://${host}`);
}

/**
 * Preview deployments run with NODE_ENV=production on a per-deployment host
 * that is not — and cannot be — registered with any OAuth provider. Pinning
 * there would bounce a preview tester onto production mid-flow, so the check
 * is limited to real production and local dev (where the canonical origin is
 * localhost via META_REDIRECT_URI, and therefore already matches).
 */
function originPinningEnabled(): boolean {
  return process.env.VERCEL_ENV !== "preview";
}

export type OriginCheck =
  | { pinned: true; canonicalOrigin: string; requestOrigin: string | null; redirectTo: string }
  | { pinned: false; canonicalOrigin: string | null; requestOrigin: string | null };

/**
 * Decides whether `request` must be bounced to the canonical origin first.
 *
 * @param request     The incoming connect request.
 * @param redirectUri The provider callback URI registered in its console — the
 *   origin the whole flow has to run on.
 * @param path        The connect endpoint to resume on after the bounce.
 */
export function checkOAuthOrigin(
  request: Request,
  redirectUri: string,
  path: string
): OriginCheck {
  const canonicalOrigin = originOf(redirectUri);
  const requestOrigin = requestPublicOrigin(request);

  if (
    !originPinningEnabled() ||
    !canonicalOrigin ||
    !requestOrigin ||
    requestOrigin === canonicalOrigin
  ) {
    return { pinned: false, canonicalOrigin, requestOrigin };
  }

  // Preserve the query string so a retry keeps whatever the caller passed.
  const search = new URL(request.url).search;
  return {
    pinned: true,
    canonicalOrigin,
    requestOrigin,
    redirectTo: `${canonicalOrigin}${path}${search}`,
  };
}
