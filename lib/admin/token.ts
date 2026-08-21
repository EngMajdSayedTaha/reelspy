// Opaque bearer tokens for the admin step-up flow (elevation cookies and
// out-of-band enrollment tickets).
//
// The rule both callers follow: the DATABASE never holds the token itself,
// only its SHA-256 digest. A leaked backup, a `select *` in a support session
// or a logged row therefore cannot be replayed into admin access — the same
// reason password reset tokens are stored hashed.
//
// Plain SHA-256 (not scrypt) is correct HERE and only here: these are 256-bit
// values from a CSPRNG, so there is no dictionary to grind and no salt to add.
// Human-chosen secrets go through lib/admin/passphrase.ts instead.

import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** 32 random bytes, base64url — safe in a cookie, a URL and a terminal. */
export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Constant-time comparison of two hex digests. Digests are not secret, so this
 * is belt-and-braces — but a token lookup that leaks its match position through
 * timing is exactly the kind of detail that is cheap to get right and expensive
 * to notice later.
 */
export function digestsMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

// Groups of five from an unambiguous alphabet (no 0/O/1/I/L): these are read
// off a terminal and typed into a browser by a human, sometimes from a phone.
const TICKET_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** e.g. "K7M2Q-8XRTB-9WFHD-4NPZC" — ~98 bits of entropy. */
export function randomEnrollmentTicket(): string {
  const bytes = randomBytes(20);
  const chars = Array.from(bytes, (byte) => TICKET_ALPHABET[byte % TICKET_ALPHABET.length]);
  return [0, 5, 10, 15].map((i) => chars.slice(i, i + 5).join("")).join("-");
}

/** Accepts what a human types: any case, with or without the dashes/spaces. */
export function normalizeEnrollmentTicket(raw: string): string {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return [0, 5, 10, 15]
    .map((i) => cleaned.slice(i, i + 5))
    .filter(Boolean)
    .join("-");
}
