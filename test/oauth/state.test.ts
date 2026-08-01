import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  issueOAuthState,
  verifyOAuthState,
  safeEqual,
  OAUTH_STATE_TTL_MS,
} from "@/lib/oauth/state";

// The OAuth `state` used to be a bare UUID that was only meaningful next to its
// httpOnly cookie. On mobile that cookie goes missing — ITP eviction, a 10-minute
// window that a phone's sign-in + SMS 2FA + account pickers routinely outlive,
// or a cross-origin start — and the callback failed with `invalid_state`.
//
// The signed state has to stand on its own: verifiable without the cookie, and
// bound to the user who started the flow so dropping the cookie doesn't drop
// the CSRF protection with it.

const SECRET = "test-app-secret";
const USER = "96ffe234-7dca-4b1d-990f-fd241d838857";

describe("safeEqual", () => {
  it("matches identical strings", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
  });

  it("rejects different strings without throwing on length mismatch", () => {
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("", "x")).toBe(false);
  });
});

describe("issueOAuthState / verifyOAuthState", () => {
  it("round-trips a freshly issued state", () => {
    const state = issueOAuthState(SECRET, { n: "nonce-1", u: USER });
    const verdict = verifyOAuthState(SECRET, state);
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.payload.u).toBe(USER);
    expect(verdict.payload.n).toBe("nonce-1");
  });

  it("produces a URL-safe token (it travels as a query param through Facebook)", () => {
    const state = issueOAuthState(SECRET, { n: "nonce-1", u: USER });
    expect(state).toBe(encodeURIComponent(state).replace(/%2E/g, "."));
    expect(state).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });

  it("issues a distinct state per call", () => {
    const a = issueOAuthState(SECRET, { n: "a", u: USER });
    const b = issueOAuthState(SECRET, { n: "b", u: USER });
    expect(a).not.toBe(b);
  });

  it("rejects a state signed with a different secret", () => {
    const state = issueOAuthState("other-secret", { n: "n", u: USER });
    expect(verifyOAuthState(SECRET, state)).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects a tampered payload — the attack the signature exists to stop", () => {
    const state = issueOAuthState(SECRET, { n: "n", u: USER });
    const [, sig] = state.split(".");
    const forged = Buffer.from(
      JSON.stringify({ n: "n", t: Date.now(), u: "attacker-user-id" })
    ).toString("base64url");
    expect(verifyOAuthState(SECRET, `${forged}.${sig}`)).toEqual({
      ok: false,
      reason: "bad_signature",
    });
  });

  it("rejects a malformed token", () => {
    expect(verifyOAuthState(SECRET, "no-dot").ok).toBe(false);
    expect(verifyOAuthState(SECRET, "").ok).toBe(false);
    expect(verifyOAuthState(SECRET, ".sig").ok).toBe(false);
    expect(verifyOAuthState(SECRET, "payload.").ok).toBe(false);
  });

  it("rejects a state older than the TTL", () => {
    const issuedAt = Date.now() - OAUTH_STATE_TTL_MS - 1000;
    const state = issueOAuthState(SECRET, { n: "n", u: USER, t: issuedAt });
    expect(verifyOAuthState(SECRET, state)).toEqual({ ok: false, reason: "expired" });
  });

  it("still accepts a state issued 30 minutes ago — the mobile consent window", () => {
    const issuedAt = Date.now() - 30 * 60 * 1000;
    const state = issueOAuthState(SECRET, { n: "n", u: USER, t: issuedAt });
    expect(verifyOAuthState(SECRET, state).ok).toBe(true);
  });

  it("treats a far-future timestamp as expired rather than trusting it", () => {
    const state = issueOAuthState(SECRET, { n: "n", u: USER, t: Date.now() + 60 * 60 * 1000 });
    expect(verifyOAuthState(SECRET, state)).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects a validly signed payload missing the user binding", () => {
    // Hand-built with the real secret: signature is good, shape is not. The
    // callback compares payload.u to the session user, so a state with no `u`
    // must never verify.
    const encoded = Buffer.from(JSON.stringify({ n: "n", t: Date.now() })).toString("base64url");
    const state = issueOAuthState(SECRET, { n: "n", u: USER });
    const sig = state.split(".")[1];
    // Re-sign the malformed payload properly so we're testing shape, not signature.
    const goodSig = createHmac("sha256", SECRET).update(encoded).digest("base64url");
    expect(sig).not.toBe(goodSig);
    expect(verifyOAuthState(SECRET, `${encoded}.${goodSig}`)).toEqual({
      ok: false,
      reason: "malformed",
    });
  });
});
