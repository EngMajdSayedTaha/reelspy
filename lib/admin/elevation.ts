// Elevated admin sessions — the "sudo mode" the admin passphrase buys.
//
// Entering the passphrase mints ONE row in admin_sessions and hands the browser
// an opaque token in an httpOnly cookie. That cookie is not a login: every
// request still needs a valid Supabase session belonging to an `is_admin`
// profile. It is the second of the two things a request must present, and it is
// the one an attacker cannot get from a stolen laptop or a leaked access token.
//
// Three independent clocks bound it:
//
//   absolute   expires_at    — an elevation always dies here, active or not.
//   idle       last_seen_at  — an unattended tab stops being trusted quickly.
//   freshness  reauth_at     — the passphrase must have been typed RECENTLY for
//                              critical actions (see lib/admin/critical-actions.ts),
//                              even inside a still-valid elevation.
//
// SameSite=Strict is deliberate and does double duty: it keeps the elevation
// off cross-site requests entirely, which means no cross-site form or image tag
// can carry it — CSRF against a mutating admin route stops being possible even
// before the same-origin check in the gate. The cost is that following a link
// into /admin from another site (an email, a chat message) arrives without the
// cookie; /admin/unlock re-checks over a same-origin fetch and lets a still-
// valid elevation straight back through, so that lands as a blink, not a
// re-prompt.

import "server-only";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { numEnv } from "@/lib/utils/env";
import { randomToken, sha256Hex } from "@/lib/admin/token";
import { ELEVATION_COOKIE } from "@/lib/admin/elevation-cookie";

// Re-exported so server code has one import for everything about elevation;
// the constant itself lives in a dependency-free module the edge can read too.
export { ELEVATION_COOKIE };

/** Absolute lifetime of one elevation. */
export const ELEVATION_TTL_MINUTES = numEnv("ADMIN_ELEVATION_TTL_MINUTES", 480);
/** Idle window: no admin request for this long ends the elevation. */
export const ELEVATION_IDLE_MINUTES = numEnv("ADMIN_ELEVATION_IDLE_MINUTES", 30);
/** How recently the passphrase must have been entered for a critical action. */
export const REAUTH_WINDOW_MINUTES = numEnv("ADMIN_REAUTH_WINDOW_MINUTES", 10);

// last_seen_at only needs to be accurate to the minute for an idle timeout
// measured in tens of minutes — writing it on every request would turn each
// admin page render into a pile of pointless UPDATEs.
const TOUCH_INTERVAL_MS = 60_000;

export type ElevationSession = {
  id: string;
  adminId: string;
  createdAt: string;
  reauthAt: string;
  lastSeenAt: string;
  expiresAt: string;
  ip: string | null;
  userAgent: string | null;
};

export type ElevationCheck =
  | { status: "ok"; session: ElevationSession }
  /** No cookie at all — never unlocked, or locked/signed out since. */
  | { status: "none" }
  /** Cookie present but the elevation is gone: expired, idled out, or revoked. */
  | { status: "expired" }
  /** Cookie belongs to a DIFFERENT admin (account switch on a shared browser). */
  | { status: "foreign" };

const COLUMNS =
  "id, admin_id, created_at, reauth_at, last_seen_at, expires_at, revoked_at, ip, user_agent";

type Row = {
  id: string;
  admin_id: string;
  created_at: string;
  reauth_at: string;
  last_seen_at: string;
  expires_at: string;
  revoked_at: string | null;
  ip: string | null;
  user_agent: string | null;
};

function toSession(row: Row): ElevationSession {
  return {
    id: row.id,
    adminId: row.admin_id,
    createdAt: row.created_at,
    reauthAt: row.reauth_at,
    lastSeenAt: row.last_seen_at,
    expiresAt: row.expires_at,
    ip: row.ip,
    userAgent: row.user_agent,
  };
}

/** The elevation token on the incoming request, if any. */
export async function readElevationToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(ELEVATION_COOKIE)?.value ?? null;
}

export function elevationCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ELEVATION_TTL_MINUTES * 60,
  };
}

export function applyElevationCookie(response: NextResponse, token: string): void {
  response.cookies.set(ELEVATION_COOKIE, token, elevationCookieOptions());
}

export function clearElevationCookie(response: NextResponse): void {
  response.cookies.set(ELEVATION_COOKIE, "", { ...elevationCookieOptions(), maxAge: 0 });
}

/**
 * Create an elevation for `adminId` and return the token to hand the browser.
 * The token is returned once and never stored — only its digest goes to the DB.
 */
export async function mintElevation(
  admin: SupabaseClient,
  input: { adminId: string; ip?: string | null; userAgent?: string | null }
): Promise<{ token: string; session: ElevationSession }> {
  const token = randomToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ELEVATION_TTL_MINUTES * 60_000).toISOString();

  const { data, error } = await admin
    .from("admin_sessions")
    .insert({
      admin_id: input.adminId,
      token_hash: sha256Hex(token),
      created_at: now.toISOString(),
      reauth_at: now.toISOString(),
      last_seen_at: now.toISOString(),
      expires_at: expiresAt,
      ip: input.ip ?? null,
      user_agent: input.userAgent ?? null,
    })
    .select(COLUMNS)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to create admin session.");

  return { token, session: toSession(data as Row) };
}

/**
 * Resolve a token to a live elevation for `adminId`. Fails closed on anything
 * unexpected — a DB error is reported as "expired", which costs the admin one
 * passphrase entry and costs an attacker everything.
 */
export async function verifyElevation(
  admin: SupabaseClient,
  adminId: string,
  token: string | null,
  now = new Date()
): Promise<ElevationCheck> {
  if (!token) return { status: "none" };

  const { data, error } = await admin
    .from("admin_sessions")
    .select(COLUMNS)
    .eq("token_hash", sha256Hex(token))
    .maybeSingle();
  if (error) return { status: "expired" };
  if (!data) return { status: "expired" };

  const row = data as Row;
  if (row.admin_id !== adminId) return { status: "foreign" };
  if (row.revoked_at) return { status: "expired" };
  if (new Date(row.expires_at) <= now) return { status: "expired" };

  const idleDeadline = new Date(row.last_seen_at).getTime() + ELEVATION_IDLE_MINUTES * 60_000;
  if (idleDeadline <= now.getTime()) return { status: "expired" };

  return { status: "ok", session: toSession(row) };
}

/** Idle-timeout heartbeat. Best-effort: a failed touch must never fail a request. */
export async function touchElevation(
  admin: SupabaseClient,
  session: ElevationSession,
  now = new Date()
): Promise<void> {
  if (now.getTime() - new Date(session.lastSeenAt).getTime() < TOUCH_INTERVAL_MS) return;
  try {
    await admin
      .from("admin_sessions")
      .update({ last_seen_at: now.toISOString() })
      .eq("id", session.id);
  } catch {
    // Losing a heartbeat only risks an early re-prompt, never wrongful access.
  }
}

/** True when the passphrase was entered recently enough for a critical action. */
export function isReauthFresh(session: ElevationSession, now = new Date()): boolean {
  return new Date(session.reauthAt).getTime() + REAUTH_WINDOW_MINUTES * 60_000 > now.getTime();
}

export function reauthExpiresAt(session: ElevationSession): string {
  return new Date(new Date(session.reauthAt).getTime() + REAUTH_WINDOW_MINUTES * 60_000).toISOString();
}

/**
 * Re-arm the freshness clock after the admin re-enters the passphrase inside an
 * existing elevation. Does NOT extend `expires_at`: the absolute deadline is
 * what stops an elevation living forever through continuous use.
 */
export async function refreshReauth(
  admin: SupabaseClient,
  sessionId: string,
  now = new Date()
): Promise<void> {
  const stamp = now.toISOString();
  const { error } = await admin
    .from("admin_sessions")
    .update({ reauth_at: stamp, last_seen_at: stamp })
    .eq("id", sessionId);
  if (error) throw new Error(error.message);
}

export async function revokeElevation(
  admin: SupabaseClient,
  sessionId: string,
  reason: string
): Promise<void> {
  await admin
    .from("admin_sessions")
    .update({ revoked_at: new Date().toISOString(), revoked_reason: reason })
    .eq("id", sessionId)
    .is("revoked_at", null);
}

/** Revoke every live elevation for an admin, optionally sparing the current one. */
export async function revokeAllElevations(
  admin: SupabaseClient,
  adminId: string,
  reason: string,
  exceptSessionId?: string | null
): Promise<number> {
  let query = admin
    .from("admin_sessions")
    .update({ revoked_at: new Date().toISOString(), revoked_reason: reason }, { count: "exact" })
    .eq("admin_id", adminId)
    .is("revoked_at", null);
  if (exceptSessionId) query = query.neq("id", exceptSessionId);
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export type ElevationSummary = ElevationSession & { current: boolean };

/** Live elevations for the admin, newest first — rendered on /admin/security. */
export async function listElevations(
  admin: SupabaseClient,
  adminId: string,
  currentSessionId: string | null,
  now = new Date()
): Promise<ElevationSummary[]> {
  const { data, error } = await admin
    .from("admin_sessions")
    .select(COLUMNS)
    .eq("admin_id", adminId)
    .is("revoked_at", null)
    .gt("expires_at", now.toISOString())
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);

  return (data as Row[] | null ?? [])
    .filter((row) => new Date(row.last_seen_at).getTime() + ELEVATION_IDLE_MINUTES * 60_000 > now.getTime())
    .map((row) => ({ ...toSession(row), current: row.id === currentSessionId }));
}

/**
 * Drop rows that can never authorize anything again. Best-effort housekeeping
 * called from the unlock path (a handful of times a day) rather than a cron —
 * the table is tiny and nothing depends on it being clean.
 */
export async function pruneElevations(admin: SupabaseClient, now = new Date()): Promise<void> {
  try {
    const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60_000).toISOString();
    await admin.from("admin_sessions").delete().lt("expires_at", cutoff);
  } catch {
    // Housekeeping only.
  }
}
