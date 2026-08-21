// The admin passphrase: hashing and verification.
//
// This is the SECOND factor that guards the control panel — a secret the admin
// knows, distinct from the account password that a Google session, a saved
// browser credential or a stolen cookie already implies. It is never stored,
// logged, audited or emailed in plaintext; only a scrypt digest of it reaches
// the database (admin_credentials.passphrase_hash).
//
// WHY SCRYPT: it ships in Node's standard library, so the hash of the single
// most sensitive secret in the product does not depend on a third-party
// package (or on a native build that breaks a serverless deploy). It is memory-
// hard, which is the property that matters here — an attacker who exfiltrates
// the table still has to spend ~32MB and ~100ms per guess. Argon2id would be
// the textbook pick; scrypt with these parameters is the strongest option
// available without adding a dependency to a Vercel Node runtime.
//
// The stored string is self-describing:
//
//   scrypt$32768$8$1$<salt-base64>$<hash-base64>
//
// so the cost parameters can be raised later without invalidating rows already
// written: verification always reads the parameters out of the stored value,
// and `needsRehash` tells the caller when a successful verify should be
// re-hashed at the current cost.
//
// No DB and no request context, so the crypto is unit-testable on its own
// (test/admin/passphrase.test.ts). The strength policy that decides whether a
// passphrase is ALLOWED lives next door in passphrase-policy.ts, because the
// forms have to run it in the browser as well.

import "server-only";
import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from "node:crypto";

// Hand-rolled rather than promisify()'d: promisify erases the callback
// overload that takes options, and the options ARE the security parameters.
function scrypt(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keylen, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

// N=32768, r=8, p=1 → 128 * N * r = 32MB per hash, ~100ms on a serverless CPU.
// Raise N (never r or p) to make it costlier; existing hashes keep verifying.
const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
// Node caps scrypt memory at 32MB by default, which is exactly what the
// parameters above need — leave headroom or it throws ERR_CRYPTO_INVALID_SCRYPT_PARAMS.
const MAX_MEM = 96 * 1024 * 1024;

// The strength policy lives in lib/admin/passphrase-policy.ts — it has to run
// in the browser too (the setup and rotate forms check as you type) and this
// module is server-only. Re-exported here so server callers have one import.
export {
  ADMIN_PASSPHRASE_MIN_LENGTH,
  validateAdminPassphrase,
  type PassphraseCheck,
} from "@/lib/admin/passphrase-policy";

export async function hashPassphrase(passphrase: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(passphrase.normalize("NFKC"), salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: MAX_MEM,
  });
  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

/**
 * Constant-time verification against a stored hash. Returns false — never
 * throws — for a malformed or empty stored value, so a corrupted row fails
 * CLOSED (nobody gets in) instead of erroring the gate open.
 */
export async function verifyPassphrase(passphrase: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4]!, "base64");
    expected = Buffer.from(parts[5]!, "base64");
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  try {
    const derived = await scrypt(passphrase.normalize("NFKC"), salt, expected.length, {
      N,
      r,
      p,
      maxmem: MAX_MEM,
    });
    // Equal lengths by construction (we derived `expected.length` bytes), so
    // timingSafeEqual can't throw here.
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/** True when a stored hash was made with weaker parameters than we use today. */
export function needsRehash(stored: string | null): boolean {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return true;
  return Number(parts[1]) < SCRYPT_N || Number(parts[2]) < SCRYPT_R;
}
