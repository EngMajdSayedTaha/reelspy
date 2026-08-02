import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  issueConfirmationCode,
  parseSignedRequest,
  verifyConfirmationCode,
} from "@/lib/meta/signed-request";

// Meta's Deauthorize and Data Deletion callbacks are UNAUTHENTICATED POSTs:
// no session, no bearer token, no IP allowlist. The HMAC in `signed_request` is
// the only thing standing between Meta and "anyone on the internet can delete
// any user's Instagram data". These tests guard that boundary — every case
// below is an attack the parser has to refuse.

const SECRET = "test-app-secret";

function encode(payload: Record<string, unknown>, secret = SECRET): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  return `${signature}.${encodedPayload}`;
}

const validPayload = {
  algorithm: "HMAC-SHA256",
  issued_at: Math.floor(Date.now() / 1000),
  user_id: "1234567890",
};

describe("parseSignedRequest", () => {
  it("accepts a genuine Meta signed_request and exposes the app-scoped user id", () => {
    const result = parseSignedRequest(encode(validPayload), SECRET);

    expect(result.ok).toBe(true);
    // The ASID is the ONLY identifier the callbacks carry — losing it here means
    // the callback can never resolve a user.
    if (result.ok) expect(result.payload.user_id).toBe("1234567890");
  });

  it("rejects a payload signed with the wrong app secret", () => {
    const result = parseSignedRequest(encode(validPayload, "someone-elses-secret"), SECRET);

    expect(result).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects a tampered payload that keeps the original signature", () => {
    // The exact forgery that matters: take a real request and swap in another
    // user's id, hoping the signature isn't re-checked against the new bytes.
    const genuine = encode(validPayload);
    const signature = genuine.slice(0, genuine.indexOf("."));
    const forgedPayload = Buffer.from(
      JSON.stringify({ ...validPayload, user_id: "9999999999" })
    ).toString("base64url");

    const result = parseSignedRequest(`${signature}.${forgedPayload}`, SECRET);

    expect(result).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects an algorithm downgrade before checking the signature", () => {
    const result = parseSignedRequest(encode({ ...validPayload, algorithm: "none" }), SECRET);

    expect(result).toEqual({ ok: false, reason: "bad_algorithm" });
  });

  it("rejects a correctly signed request that is too old to be live traffic", () => {
    const stale = { ...validPayload, issued_at: Math.floor(Date.now() / 1000) - 60 * 60 * 48 };

    const result = parseSignedRequest(encode(stale), SECRET);

    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  it.each([
    ["missing", null],
    ["empty", ""],
    ["no separator", "notasignedrequest"],
    ["signature only", "abc."],
    ["payload only", ".abc"],
    ["undecodable payload", `${"a".repeat(43)}.@@@not-base64@@@`],
  ])("rejects a %s signed_request as malformed", (_label, input) => {
    const result = parseSignedRequest(input, SECRET);

    expect(result.ok).toBe(false);
  });

  it("rejects everything when the app secret is unset", () => {
    // A deployment missing META_APP_SECRET must fail closed, never open.
    expect(parseSignedRequest(encode(validPayload), "").ok).toBe(false);
  });
});

describe("confirmation codes", () => {
  it("round-trips the deletion timestamp", () => {
    const at = new Date("2026-08-02T10:30:00Z");

    const result = verifyConfirmationCode(SECRET, issueConfirmationCode(SECRET, at));

    expect(result.ok).toBe(true);
    // Second precision is all the status page renders.
    if (result.ok) {
      expect(Math.floor(result.deletedAt.getTime() / 1000)).toBe(Math.floor(at.getTime() / 1000));
    }
  });

  it("refuses a code minted with a different secret", () => {
    const forged = issueConfirmationCode("attacker-secret");

    expect(verifyConfirmationCode(SECRET, forged)).toEqual({ ok: false });
  });

  it("refuses a code whose timestamp was edited to a different date", () => {
    const code = issueConfirmationCode(SECRET);
    const signature = code.slice(code.indexOf(".") + 1);

    expect(verifyConfirmationCode(SECRET, `zzzzzz.${signature}`)).toEqual({ ok: false });
  });

  it.each([null, undefined, "", "nodot"])("refuses %p", (input) => {
    expect(verifyConfirmationCode(SECRET, input)).toEqual({ ok: false });
  });
});
