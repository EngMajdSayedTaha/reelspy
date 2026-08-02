// Meta `signed_request` — the only thing Meta sends to a platform callback.
//
// WHY THIS EXISTS
// ---------------
// Meta's Deauthorize and Data Deletion callbacks are unauthenticated POSTs from
// Facebook's servers. There is no session, no bearer token and no IP allowlist:
// the ONLY proof that a request is really from Meta is an HMAC over the payload,
// keyed on the app secret. Anyone can POST to those URLs, so a callback that
// skips this check is a remote "delete any user's data" endpoint.
//
// FORMAT
// ------
//   signed_request = base64url(HMAC-SHA256(payload_b64, app_secret)) + "." + payload_b64
//
// Note the order: SIGNATURE first, then payload — the reverse of the scheme in
// lib/oauth/state.ts, which is ours and puts the payload first. Both live in
// this repo; don't copy one's split logic into the other.
//
// The decoded payload carries `user_id` — the app-scoped user ID (ASID). It is
// NOT the Instagram business account id we store as `ig_user_id`, and it is not
// stable across apps. Resolving it back to a ReelSpy user is only possible
// because the connect callback records it on `profiles.fb_user_id`
// (migration 20260802120000).

import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export type SignedRequestPayload = {
  /** App-scoped user ID (ASID) of the Facebook user. */
  user_id?: string;
  algorithm?: string;
  issued_at?: number;
};

export type SignedRequestResult =
  | { ok: true; payload: SignedRequestPayload }
  | { ok: false; reason: "malformed" | "bad_algorithm" | "bad_signature" | "expired" };

// Meta issues these at the moment of the callback. A wide window is fine — this
// is replay protection, not a session — but an unbounded one lets a signature
// captured from logs be replayed indefinitely.
const MAX_AGE_SECONDS = 24 * 60 * 60;

function fromBase64Url(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function safeEqual(a: Buffer, b: Buffer): boolean {
  // timingSafeEqual throws on a length mismatch, which would itself leak length
  // through the exception path — compare lengths first, non-secretly.
  return a.length === b.length && timingSafeEqual(a, b);
}

export function parseSignedRequest(
  signedRequest: string | null | undefined,
  appSecret: string
): SignedRequestResult {
  if (!signedRequest || !appSecret) return { ok: false, reason: "malformed" };

  const dot = signedRequest.indexOf(".");
  if (dot <= 0 || dot === signedRequest.length - 1) return { ok: false, reason: "malformed" };

  const encodedSignature = signedRequest.slice(0, dot);
  const encodedPayload = signedRequest.slice(dot + 1);

  let payload: SignedRequestPayload;
  try {
    payload = JSON.parse(fromBase64Url(encodedPayload).toString("utf8")) as SignedRequestPayload;
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!payload || typeof payload !== "object") return { ok: false, reason: "malformed" };

  // Meta has only ever sent HMAC-SHA256 here. Rejecting anything else stops the
  // classic "algorithm: none" downgrade before the signature is even computed.
  if (payload.algorithm && payload.algorithm.toUpperCase() !== "HMAC-SHA256") {
    return { ok: false, reason: "bad_algorithm" };
  }

  // The signature covers the ENCODED payload, byte for byte — never the decoded
  // JSON, which would not round-trip.
  const expected = createHmac("sha256", appSecret).update(encodedPayload).digest();
  if (!safeEqual(fromBase64Url(encodedSignature), expected)) {
    return { ok: false, reason: "bad_signature" };
  }

  if (typeof payload.issued_at === "number") {
    const ageSeconds = Math.floor(Date.now() / 1000) - payload.issued_at;
    if (ageSeconds > MAX_AGE_SECONDS) return { ok: false, reason: "expired" };
  }

  return { ok: true, payload };
}

// ── Confirmation codes ──────────────────────────────────────────────────────
// Meta's data-deletion callback must answer with a confirmation code AND a URL
// where the user can check that deletion's status. The obvious implementation is
// a `deletion_requests` table — but deletion here is SYNCHRONOUS (the route
// finishes erasing before it replies), so there is no pending state to store and
// a table would only ever hold rows saying "done".
//
// Instead the code is self-describing: a timestamp plus an HMAC over it. The
// status page verifies the signature and reports completion with the real
// timestamp. No table, no growth, nothing to clean up — and a forged code is
// rejected rather than shown a reassuring "deleted" page.

export function issueConfirmationCode(appSecret: string, at: Date = new Date()): string {
  const issuedAt = Math.floor(at.getTime() / 1000).toString(36);
  const sig = createHmac("sha256", appSecret).update(issuedAt).digest("base64url").slice(0, 16);
  return `${issuedAt}.${sig}`;
}

export function verifyConfirmationCode(
  appSecret: string,
  code: string | null | undefined
): { ok: true; deletedAt: Date } | { ok: false } {
  if (!code) return { ok: false };
  const dot = code.indexOf(".");
  if (dot <= 0) return { ok: false };

  const issuedAt = code.slice(0, dot);
  const sig = code.slice(dot + 1);
  const expected = createHmac("sha256", appSecret).update(issuedAt).digest("base64url").slice(0, 16);
  if (!safeEqual(Buffer.from(sig), Buffer.from(expected))) return { ok: false };

  const seconds = Number.parseInt(issuedAt, 36);
  if (!Number.isFinite(seconds)) return { ok: false };

  return { ok: true, deletedAt: new Date(seconds * 1000) };
}
