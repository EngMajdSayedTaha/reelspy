// The admin_credentials row: read it, verify a passphrase against it, count
// failures, lock out a grinder, and handle out-of-band enrollment.
//
// Everything here goes through the SERVICE-ROLE client. admin_credentials has
// RLS on with no policies, so the anon key cannot read a hash, a lockout state
// or a ticket even for the admin's own row — a bug that leaks the client into a
// browser bundle still leaks nothing.
//
// ── Why enrollment is out of band ──────────────────────────────────────────
// If a signed-in admin could simply choose their first passphrase in the UI,
// step-up authentication would be theatre: whoever stole the session would set
// it themselves and walk straight in. So the first passphrase (and any reset of
// a forgotten one) needs a secret the attacker does not have — proof of access
// to the Supabase service-role key, i.e. to the infrastructure itself. That is
// what `scripts/admin-passphrase.mjs` mints: a one-time ticket, hashed here,
// valid for a short window, redeemed once at /admin/setup.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { numEnv } from "@/lib/utils/env";
import { hashPassphrase, needsRehash, verifyPassphrase } from "@/lib/admin/passphrase";
import {
  digestsMatch,
  normalizeEnrollmentTicket,
  randomEnrollmentTicket,
  sha256Hex,
} from "@/lib/admin/token";

/** Consecutive failures before the passphrase locks. */
export const MAX_FAILED_ATTEMPTS = numEnv("ADMIN_UNLOCK_MAX_ATTEMPTS", 5);
/** First lockout, in minutes. Each further failure doubles it, up to the cap. */
const LOCK_BASE_MINUTES = numEnv("ADMIN_UNLOCK_LOCK_MINUTES", 5);
const LOCK_MAX_MINUTES = 60;
/** How long a CLI-minted enrollment ticket stays redeemable. */
export const ENROLLMENT_TICKET_TTL_MINUTES = numEnv("ADMIN_ENROLLMENT_TTL_MINUTES", 30);

export type AdminCredentialRow = {
  user_id: string;
  passphrase_hash: string | null;
  passphrase_set_at: string | null;
  failed_attempts: number;
  last_failed_at: string | null;
  locked_until: string | null;
  enrollment_hash: string | null;
  enrollment_expires_at: string | null;
  enrollment_created_at: string | null;
  last_verified_at: string | null;
};

const COLUMNS =
  "user_id, passphrase_hash, passphrase_set_at, failed_attempts, last_failed_at, locked_until, enrollment_hash, enrollment_expires_at, enrollment_created_at, last_verified_at";

export async function readCredential(
  admin: SupabaseClient,
  userId: string
): Promise<AdminCredentialRow | null> {
  const { data, error } = await admin
    .from("admin_credentials")
    .select(COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as AdminCredentialRow | null) ?? null;
}

export type EnrollmentState = "enrolled" | "invited" | "none";

/** What the setup/unlock pages need to know before showing a form. */
export function enrollmentState(row: AdminCredentialRow | null, now = new Date()): EnrollmentState {
  if (row?.passphrase_hash) return "enrolled";
  if (row?.enrollment_hash && row.enrollment_expires_at && new Date(row.enrollment_expires_at) > now) {
    return "invited";
  }
  return "none";
}

export function lockRemainingSeconds(row: AdminCredentialRow | null, now = new Date()): number {
  if (!row?.locked_until) return 0;
  const remaining = Math.ceil((new Date(row.locked_until).getTime() - now.getTime()) / 1000);
  return remaining > 0 ? remaining : 0;
}

// 5 failures → 5 min, 6 → 10, 7 → 20, 8 → 40, 9+ → 60 (capped). Progressive
// rather than permanent on purpose: a permanent lock hands anyone who can spam
// the form a denial-of-service against the founder's own control panel, right
// when they may be locking it down BECAUSE something is going wrong.
function lockMinutesFor(failedAttempts: number): number {
  const over = failedAttempts - MAX_FAILED_ATTEMPTS;
  if (over < 0) return 0;
  return Math.min(LOCK_MAX_MINUTES, LOCK_BASE_MINUTES * 2 ** over);
}

export type VerifyOutcome =
  /** Correct passphrase; the caller may now mint or refresh an elevation. */
  | { status: "ok" }
  /** No passphrase has ever been set for this admin — send them to /admin/setup. */
  | { status: "not_enrolled" }
  /** Wrong passphrase. `lockedForSeconds` > 0 means this attempt tripped the lock. */
  | { status: "invalid"; failedAttempts: number; remainingAttempts: number; lockedForSeconds: number }
  /** Already locked out; nothing was even compared. */
  | { status: "locked"; lockedForSeconds: number };

/**
 * Verify a submitted passphrase and record the outcome atomically enough for a
 * single-writer admin flow: failures increment the counter and may set a lock,
 * success clears both.
 *
 * Never says WHICH part was wrong beyond "invalid" — and callers must not
 * either: an error message that distinguishes "no such admin" from "wrong
 * passphrase" is a free account-enumeration oracle.
 */
export async function verifyAdminPassphrase(
  admin: SupabaseClient,
  userId: string,
  passphrase: string
): Promise<VerifyOutcome> {
  const row = await readCredential(admin, userId);
  const now = new Date();

  const locked = lockRemainingSeconds(row, now);
  if (locked > 0) return { status: "locked", lockedForSeconds: locked };

  if (!row?.passphrase_hash) return { status: "not_enrolled" };

  const ok = await verifyPassphrase(passphrase, row.passphrase_hash);

  if (!ok) {
    const failedAttempts = (row.failed_attempts ?? 0) + 1;
    const lockMinutes = lockMinutesFor(failedAttempts);
    const lockedUntil =
      lockMinutes > 0 ? new Date(now.getTime() + lockMinutes * 60_000).toISOString() : null;
    await admin
      .from("admin_credentials")
      .update({
        failed_attempts: failedAttempts,
        last_failed_at: now.toISOString(),
        locked_until: lockedUntil,
        updated_at: now.toISOString(),
      })
      .eq("user_id", userId);
    return {
      status: "invalid",
      failedAttempts,
      remainingAttempts: Math.max(0, MAX_FAILED_ATTEMPTS - failedAttempts),
      lockedForSeconds: lockMinutes * 60,
    };
  }

  // Correct. Clear the brute-force state and, if the stored hash predates a
  // cost increase, transparently upgrade it while we hold the plaintext.
  const patch: Record<string, unknown> = {
    failed_attempts: 0,
    last_failed_at: null,
    locked_until: null,
    last_verified_at: now.toISOString(),
    updated_at: now.toISOString(),
  };
  if (needsRehash(row.passphrase_hash)) {
    patch.passphrase_hash = await hashPassphrase(passphrase);
  }
  await admin.from("admin_credentials").update(patch).eq("user_id", userId);

  return { status: "ok" };
}

/**
 * Write a new passphrase. Callers MUST have already proven the right to do so —
 * either by verifying the current passphrase or by redeeming an enrollment
 * ticket. Clears the lockout state and burns any outstanding ticket, so an
 * invite that was minted and then not used cannot be replayed later.
 */
export async function setAdminPassphrase(
  admin: SupabaseClient,
  userId: string,
  passphrase: string
): Promise<void> {
  const now = new Date().toISOString();
  const passphrase_hash = await hashPassphrase(passphrase);
  const { error } = await admin.from("admin_credentials").upsert(
    {
      user_id: userId,
      passphrase_hash,
      passphrase_set_at: now,
      failed_attempts: 0,
      last_failed_at: null,
      locked_until: null,
      enrollment_hash: null,
      enrollment_expires_at: null,
      enrollment_created_at: null,
      updated_at: now,
    },
    { onConflict: "user_id" }
  );
  if (error) throw new Error(error.message);
}

/**
 * Mint a one-time enrollment ticket and return the PLAINTEXT — the only moment
 * it exists anywhere. Called by the CLI (service-role key required), never by a
 * request handler: see the header comment for why that separation is the whole
 * point.
 */
export async function mintEnrollmentTicket(
  admin: SupabaseClient,
  userId: string,
  ttlMinutes = ENROLLMENT_TICKET_TTL_MINUTES
): Promise<{ ticket: string; expiresAt: string }> {
  const ticket = randomEnrollmentTicket();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60_000).toISOString();
  const { error } = await admin.from("admin_credentials").upsert(
    {
      user_id: userId,
      enrollment_hash: sha256Hex(ticket),
      enrollment_expires_at: expiresAt,
      enrollment_created_at: now.toISOString(),
      // A ticket is also the way back in from a lockout.
      failed_attempts: 0,
      locked_until: null,
      updated_at: now.toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (error) throw new Error(error.message);
  return { ticket, expiresAt };
}

export type TicketOutcome = { ok: true } | { ok: false; reason: "invalid" | "expired" | "none" };

/** Single-use check. The ticket is burned by setAdminPassphrase right after. */
export async function checkEnrollmentTicket(
  admin: SupabaseClient,
  userId: string,
  submitted: string
): Promise<TicketOutcome> {
  const row = await readCredential(admin, userId);
  if (!row?.enrollment_hash || !row.enrollment_expires_at) return { ok: false, reason: "none" };
  if (new Date(row.enrollment_expires_at) <= new Date()) return { ok: false, reason: "expired" };
  const normalized = normalizeEnrollmentTicket(submitted);
  if (!normalized) return { ok: false, reason: "invalid" };
  if (!digestsMatch(sha256Hex(normalized), row.enrollment_hash)) return { ok: false, reason: "invalid" };
  return { ok: true };
}

/** Clear a lockout without touching the passphrase (CLI recovery path). */
export async function clearLockout(admin: SupabaseClient, userId: string): Promise<void> {
  const { error } = await admin
    .from("admin_credentials")
    .update({
      failed_attempts: 0,
      last_failed_at: null,
      locked_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}
