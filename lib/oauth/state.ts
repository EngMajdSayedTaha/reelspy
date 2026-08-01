// Signed OAuth `state` — a CSRF token that survives a missing cookie.
//
// WHY THE COOKIE ALONE ISN'T ENOUGH
// ---------------------------------
// The old scheme was: put a random UUID in an httpOnly cookie, put the same
// UUID in the `state` query param, compare them in the callback. That check is
// only as reliable as the cookie, and on a phone the cookie is the fragile
// part of the flow:
//
//   * iOS Safari ITP evicts cookies from a site the user hasn't interacted with
//     recently, and the provider round-trip is exactly such a gap.
//   * The cookie was capped at 10 minutes. On desktop the Facebook dialog is
//     two clicks on an already-signed-in session — seconds. On a phone it is
//     sign-in, an SMS 2FA code (which means leaving the browser, so the tab may
//     be evicted), a Page picker and an Instagram-account picker. Ten minutes
//     is routinely not enough.
//   * If the flow starts on a different origin than the callback lands on, the
//     cookie is not sent at all (see lib/oauth/origin.ts).
//
// A cookie miss produced `invalid_state` — indistinguishable, from the user's
// side, from "connecting is broken".
//
// WHAT THIS REPLACES IT WITH
// --------------------------
// `state` becomes `base64url(payload).base64url(HMAC-SHA256(payload))`, keyed
// on META_APP_SECRET (server-only, already required for the flow to work at
// all). The payload carries the issue time and — this is the important part —
// the USER ID the flow was started for.
//
// The callback then verifies: signature valid, not expired, and the embedded
// user id equals the id of the session that came back. That is a STRONGER
// binding than the cookie ever provided: the old cookie proved only "this
// browser started some flow", never "this flow belongs to this account". The
// classic OAuth login-CSRF (attacker gets a victim to complete a flow that
// links the ATTACKER's Instagram to the victim's ReelSpy account) is blocked by
// the user-id check even with no cookie present at all.
//
// The cookie is still set and still checked first — it just stopped being the
// single point of failure.

import { createHmac, timingSafeEqual } from "node:crypto";

/** How long an issued state stays valid. Generous: mobile consent is slow. */
export const OAUTH_STATE_TTL_MS = 60 * 60 * 1000; // 1 hour

export type OAuthStatePayload = {
  /** Random nonce — makes every state unique even within the same millisecond. */
  n: string;
  /** Issued-at, epoch milliseconds. */
  t: number;
  /** The user id this flow was started for. */
  u: string;
};

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(payloadB64: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadB64).digest("base64url");
}

/** Constant-time string compare that never throws on length mismatch. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function issueOAuthState(
  secret: string,
  payload: Omit<OAuthStatePayload, "t"> & { t?: number }
): string {
  const full: OAuthStatePayload = { n: payload.n, u: payload.u, t: payload.t ?? Date.now() };
  const encoded = b64url(JSON.stringify(full));
  return `${encoded}.${sign(encoded, secret)}`;
}

export type StateVerdict =
  | { ok: true; payload: OAuthStatePayload }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" };

export function verifyOAuthState(
  secret: string,
  token: string,
  ttlMs: number = OAUTH_STATE_TTL_MS,
  now: number = Date.now()
): StateVerdict {
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return { ok: false, reason: "malformed" };

  const encoded = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  if (!safeEqual(signature, sign(encoded, secret))) {
    return { ok: false, reason: "bad_signature" };
  }

  let payload: OAuthStatePayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (typeof payload?.t !== "number" || typeof payload?.u !== "string" || !payload.u) {
    return { ok: false, reason: "malformed" };
  }
  // A clock-skewed future timestamp is treated as expired rather than trusted.
  if (now - payload.t > ttlMs || payload.t > now + 5 * 60_000) {
    return { ok: false, reason: "expired" };
  }

  return { ok: true, payload };
}
