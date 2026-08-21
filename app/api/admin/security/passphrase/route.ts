import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminIdentity } from "@/lib/admin/auth";
import { parseBody } from "@/lib/admin/mutation";
import { writeAudit } from "@/lib/admin/audit";
import {
  checkEnrollmentTicket,
  enrollmentState,
  readCredential,
  setAdminPassphrase,
  verifyAdminPassphrase,
} from "@/lib/admin/credentials";
import { validateAdminPassphrase } from "@/lib/admin/passphrase";
import {
  applyElevationCookie,
  mintElevation,
  reauthExpiresAt,
  readElevationToken,
  revokeAllElevations,
  verifyElevation,
} from "@/lib/admin/elevation";
import { notifyAdmins } from "@/lib/notifications/notify";
import { consumeUserAction } from "@/lib/utils/user-rate-limit";

export const runtime = "nodejs";

// POST /api/admin/security/passphrase — set or rotate the admin passphrase.
//
// TWO ways to prove you may do this, and no third:
//
//   rotate  you know the CURRENT passphrase (and the panel is already unlocked
//           on this device). The everyday path.
//   enroll  you hold a one-time ticket minted out of band by
//           scripts/admin-passphrase.mjs, which needs the Supabase service-role
//           key. The first-time path, and the way back from a forgotten
//           passphrase.
//
// The second one is the load-bearing design decision. If a signed-in admin
// could simply choose a first passphrase in the browser, then whoever stole the
// session would choose it — and step-up authentication would protect nothing.
// Requiring infrastructure access to bootstrap the factor is what keeps a
// stolen session from promoting itself.
//
// On success EVERY elevation for this admin is revoked (a rotation is usually a
// response to something) and a fresh one is minted for the device that did the
// rotating, so the admin is not thrown out of the panel mid-incident.
const schema = z
  .object({
    passphrase: z.string().min(1).max(512),
    /** Current passphrase — the rotate path. */
    current: z.string().min(1).max(512).optional(),
    /** One-time CLI ticket — the enroll/reset path. */
    ticket: z.string().min(1).max(64).optional(),
  })
  .refine((body) => Boolean(body.current) !== Boolean(body.ticket), {
    message: "Provide either your current passphrase or an enrollment ticket.",
  });

export async function POST(request: Request) {
  const gate = await requireAdminIdentity(request);
  if (!gate.ok) return gate.response;
  const { user, supabase, admin, ip, userAgent } = gate.ctx;

  const body = await parseBody(request, schema);
  if (!body.ok) return body.response;
  const { passphrase, current, ticket } = body.data;

  const { allowed, retryAfterSeconds } = await consumeUserAction(supabase, user.id, "admin_unlock");
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again shortly.", code: "rate_limited", retryAfterSeconds },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  // Policy first: no point burning an enrollment ticket on a passphrase we're
  // going to reject anyway.
  const check = validateAdminPassphrase(passphrase, { email: user.email });
  if (!check.valid) {
    return NextResponse.json(
      { error: check.problems[0], code: "weak_passphrase", problems: check.problems },
      { status: 400 }
    );
  }

  const before = await readCredential(admin, user.id).catch(() => null);
  const state = enrollmentState(before);
  let via: "rotate" | "enroll";

  if (current) {
    // ── Rotate ──────────────────────────────────────────────────────────────
    // Knowing the current passphrase is the proof; the live elevation is the
    // second condition, so a session that never unlocked the panel cannot swap
    // the factor that is keeping it out.
    const elevation = await verifyElevation(admin, user.id, await readElevationToken()).catch(
      () => ({ status: "expired" }) as const
    );
    if (elevation.status !== "ok") {
      return NextResponse.json(
        { error: "Unlock the panel before changing the passphrase.", code: "elevation_required" },
        { status: 403 }
      );
    }

    const outcome = await verifyAdminPassphrase(admin, user.id, current);
    if (outcome.status === "locked") {
      return NextResponse.json(
        {
          error: `Too many wrong attempts. Try again in ${Math.ceil(outcome.lockedForSeconds / 60)} min.`,
          code: "locked",
          retryAfterSeconds: outcome.lockedForSeconds,
        },
        { status: 423 }
      );
    }
    if (outcome.status === "not_enrolled") {
      return NextResponse.json(
        { error: "No admin passphrase is set for this account yet.", code: "not_enrolled" },
        { status: 403 }
      );
    }
    if (outcome.status === "invalid") {
      await writeAudit(admin, {
        adminId: user.id,
        action: "admin.unlock_failed",
        targetType: "admin_credential",
        targetId: user.id,
        payload: { context: "rotate", failed_attempts: outcome.failedAttempts },
        ip,
        userAgent,
      });
      return NextResponse.json(
        {
          error: "That is not your current passphrase.",
          code: "invalid_passphrase",
          remainingAttempts: outcome.remainingAttempts,
        },
        { status: 403 }
      );
    }
    via = "rotate";
  } else {
    // ── Enroll / reset with an out-of-band ticket ───────────────────────────
    const outcome = await checkEnrollmentTicket(admin, user.id, ticket!);
    if (!outcome.ok) {
      await writeAudit(admin, {
        adminId: user.id,
        action: "admin.enrollment_failed",
        targetType: "admin_credential",
        targetId: user.id,
        payload: { reason: outcome.reason },
        ip,
        userAgent,
      });
      const message =
        outcome.reason === "expired"
          ? "That enrollment code has expired. Mint a new one."
          : outcome.reason === "none"
            ? "There is no pending enrollment code for this account."
            : "That enrollment code is not valid.";
      return NextResponse.json({ error: message, code: `ticket_${outcome.reason}` }, { status: 403 });
    }
    via = "enroll";
  }

  await setAdminPassphrase(admin, user.id, passphrase);

  // A rotation invalidates every existing elevation — including the one that
  // performed it — and we immediately hand this device a new one. Any OTHER
  // browser holding elevation is now locked out and must present the new
  // passphrase, which is the entire point when the reason for rotating is "I
  // think someone else has been in here".
  const revoked = await revokeAllElevations(admin, user.id, `passphrase_${via}`).catch(() => 0);
  const minted = await mintElevation(admin, { adminId: user.id, ip, userAgent });

  await writeAudit(admin, {
    adminId: user.id,
    action: via === "enroll" ? "admin.passphrase_enrolled" : "admin.passphrase_rotated",
    targetType: "admin_credential",
    targetId: user.id,
    payload: { previous_state: state, sessions_revoked: revoked },
    ip,
    userAgent,
  });

  await notifyAdmins(
    "admin.passphrase_changed",
    {
      title: via === "enroll" ? "An admin passphrase was set" : "The admin passphrase was changed",
      summary:
        "Every other unlocked admin session was signed out of the panel. If you didn't do this, the account is compromised — rotate its login credentials now.",
      context: {
        Account: user.email ?? user.id,
        Method: via === "enroll" ? "enrollment code (out of band)" : "current passphrase",
        "Sessions revoked": revoked,
        IP: ip ?? undefined,
        Device: userAgent ?? undefined,
      },
      link: "/admin/security",
    },
    { admin }
  );

  const response = NextResponse.json({
    ok: true,
    elevated: true,
    expiresAt: minted.session.expiresAt,
    reauthExpiresAt: reauthExpiresAt(minted.session),
    sessionsRevoked: revoked,
  });
  applyElevationCookie(response, minted.token);
  return response;
}
