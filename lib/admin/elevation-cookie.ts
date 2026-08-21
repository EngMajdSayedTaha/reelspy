// The two constants the EDGE needs to know about admin elevation.
//
// Kept in their own dependency-free module because middleware.ts runs in the
// edge runtime: importing lib/admin/elevation.ts there would drag in
// `server-only`, next/headers and node:crypto and fail the build. Everything
// else about elevation — minting, verification, expiry — stays server-side,
// where it belongs; the edge only ever asks "is a cookie present?".

export const ELEVATION_COOKIE = "reelspy_admin_elev";

/**
 * The /admin screens that must stay reachable WITHOUT elevation, because they
 * are how an admin obtains one. Everything else under /admin requires it.
 */
export const ADMIN_GATE_PATHS = ["/admin/unlock", "/admin/setup"] as const;
