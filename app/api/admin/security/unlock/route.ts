import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminIdentity } from "@/lib/admin/auth";
import { parseBody } from "@/lib/admin/mutation";
import { writeAudit } from "@/lib/admin/audit";
import { verifyAdminPassphrase } from "@/lib/admin/credentials";
import {
  applyElevationCookie,
  mintElevation,
  pruneElevations,
  reauthExpiresAt,
  readElevationToken,
  refreshReauth,
  verifyElevation,
} from "@/lib/admin/elevation";
import { notifyAdmins } from "@/lib/notifications/notify";
import { consumeUserAction } from "@/lib/utils/user-rate-limit";

export const runtime = "nodejs";

// POST /api/admin/security/unlock — trade the admin passphrase for elevation.
//
// This is the ONLY way into the control panel, and it does double duty:
//   • no live elevation  → mint one (the "unlock" case)
//   • live elevation     → re-arm the freshness clock without extending the
//                          absolute deadline (the "confirm for this critical
//                          action" case)
//
// Both are the same act — the admin proved knowledge of the second factor — so
// they share one endpoint, one rate limit, one lockout and one audit trail.
//
// Answers are deliberately uniform: a wrong passphrase never says whether the
// account exists, how many admins there are, or anything but "no, and here's
// how many tries you have left".
const schema = z.object({
  passphrase: z.string().min(1).max(512),
});

export async function POST(request: Request) {
  const gate = await requireAdminIdentity(request);
  if (!gate.ok) return gate.response;
  const { user, supabase, admin, ip, userAgent } = gate.ctx;

  const body = await parseBody(request, schema);
  if (!body.ok) return body.response;

  // Coarse ceiling on attempts per admin per hour. The authoritative
  // brute-force defense is the per-credential lockout below (which fails
  // CLOSED); this one fails open by design, so it is a speed bump, not a lock.
  const { allowed, retryAfterSeconds } = await consumeUserAction(supabase, user.id, "admin_unlock");
  if (!allowed) {
    return NextResponse.json(
      {
        error: "Too many attempts. Wait a few minutes before trying again.",
        code: "rate_limited",
        retryAfterSeconds,
      },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  const outcome = await verifyAdminPassphrase(admin, user.id, body.data.passphrase);

  if (outcome.status === "not_enrolled") {
    return NextResponse.json(
      {
        error: "No admin passphrase is set for this account yet.",
        code: "not_enrolled",
      },
      { status: 403 }
    );
  }

  if (outcome.status === "locked") {
    return NextResponse.json(
      {
        error: `Too many wrong attempts. Try again in ${Math.ceil(outcome.lockedForSeconds / 60)} min.`,
        code: "locked",
        retryAfterSeconds: outcome.lockedForSeconds,
      },
      { status: 423, headers: { "Retry-After": String(outcome.lockedForSeconds) } }
    );
  }

  if (outcome.status === "invalid") {
    await writeAudit(admin, {
      adminId: user.id,
      action: "admin.unlock_failed",
      targetType: "admin_session",
      targetId: null,
      payload: {
        failed_attempts: outcome.failedAttempts,
        locked_for_seconds: outcome.lockedForSeconds,
      },
      ip,
      userAgent,
    });

    // Somebody with a valid founder session is guessing the second factor.
    // That is either the founder mistyping, or exactly the scenario this whole
    // mechanism exists for — so it is worth an alert either way, folded so a
    // burst of guesses is one message.
    await notifyAdmins(
      outcome.lockedForSeconds > 0 ? "admin.locked_out" : "admin.unlock_failed",
      {
        title:
          outcome.lockedForSeconds > 0
            ? "Admin panel LOCKED after repeated wrong passphrases"
            : "Wrong admin passphrase entered",
        summary:
          outcome.lockedForSeconds > 0
            ? "The admin passphrase is locked for now. If this wasn't you, the account's login is already compromised — rotate it and the passphrase immediately."
            : "Someone signed in as an admin and got the admin passphrase wrong.",
        context: {
          Account: user.email ?? user.id,
          "Failed attempts": outcome.failedAttempts,
          "Locked for": outcome.lockedForSeconds > 0 ? `${Math.ceil(outcome.lockedForSeconds / 60)} min` : undefined,
          IP: ip ?? undefined,
          Device: userAgent ?? undefined,
        },
        dedupeKey: `admin-unlock:${user.id}`,
        link: "/admin/security",
      },
      { admin }
    );

    return NextResponse.json(
      {
        error:
          outcome.lockedForSeconds > 0
            ? `That passphrase is wrong. Too many attempts — locked for ${Math.ceil(outcome.lockedForSeconds / 60)} min.`
            : "That passphrase is wrong.",
        code: outcome.lockedForSeconds > 0 ? "locked" : "invalid_passphrase",
        remainingAttempts: outcome.remainingAttempts,
        retryAfterSeconds: outcome.lockedForSeconds || undefined,
      },
      { status: outcome.lockedForSeconds > 0 ? 423 : 403 }
    );
  }

  // ── Correct ───────────────────────────────────────────────────────────────
  const existing = await verifyElevation(admin, user.id, await readElevationToken()).catch(
    () => ({ status: "expired" }) as const
  );

  let token: string | null = null;
  let session;
  if (existing.status === "ok") {
    // Re-auth inside a live elevation: re-arm freshness only. Extending the
    // absolute deadline here would let a panel left open all day stay open
    // forever, one confirmation at a time.
    await refreshReauth(admin, existing.session.id);
    session = { ...existing.session, reauthAt: new Date().toISOString() };
  } else {
    const minted = await mintElevation(admin, { adminId: user.id, ip, userAgent });
    token = minted.token;
    session = minted.session;
  }

  await writeAudit(admin, {
    adminId: user.id,
    action: token ? "admin.unlock" : "admin.reauth",
    targetType: "admin_session",
    targetId: session.id,
    payload: { expires_at: session.expiresAt },
    ip,
    userAgent,
  });

  if (token) {
    await notifyAdmins(
      "admin.unlocked",
      {
        title: "Admin panel unlocked",
        summary: "The admin passphrase was accepted and a new elevated session started.",
        context: { Account: user.email ?? user.id, IP: ip ?? undefined, Device: userAgent ?? undefined },
        link: "/admin/security",
      },
      { admin }
    );
    await pruneElevations(admin);
  }

  const response = NextResponse.json({
    ok: true,
    elevated: true,
    expiresAt: session.expiresAt,
    reauthExpiresAt: reauthExpiresAt(session),
  });
  if (token) applyElevationCookie(response, token);
  return response;
}
