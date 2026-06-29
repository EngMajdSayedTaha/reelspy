import type { CookieOptions } from "@supabase/ssr";

// One source of truth for how the Supabase auth cookies are written, shared by
// the browser client, the server client, and the middleware.
//
// Why this exists: the session is stored ENTIRELY in these cookies. On mobile
// Safari (iOS) Intelligent Tracking Prevention caps the lifetime of cookies
// written from JavaScript (document.cookie) to ~7 days — and for a site that
// performs a cross-site OAuth redirect (Google) it is frequently capped to
// ~24h. That is why a phone appears "logged out" after a deploy cycle while the
// same account stays signed in on desktop. Two things keep the phone signed in:
//
//   1) A long, explicit maxAge so the cookie is persistent (not a session
//      cookie that dies when the OS kills the backgrounded browser).
//   2) Re-setting the cookie from the SERVER on every request (see middleware).
//      Server Set-Cookie headers are NOT subject to the ITP JS-cookie cap, so
//      each visit re-extends the lifetime on mobile.
//
// 400 days is the maximum the Chrome cookie spec honours and matches the
// @supabase/ssr default, so it is the safe practical ceiling.
const FOUR_HUNDRED_DAYS_IN_SECONDS = 400 * 24 * 60 * 60;

export const authCookieOptions: CookieOptions = {
  maxAge: FOUR_HUNDRED_DAYS_IN_SECONDS,
  path: "/",
  sameSite: "lax",
  // Secure is required for SameSite cookies on HTTPS; relax it in local dev so
  // http://localhost still works.
  secure: process.env.NODE_ENV === "production",
};
