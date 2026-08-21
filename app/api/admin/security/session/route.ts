import { NextResponse } from "next/server";
import { requireAdminIdentity } from "@/lib/admin/auth";
import { enrollmentState, lockRemainingSeconds, readCredential } from "@/lib/admin/credentials";
import {
  ELEVATION_IDLE_MINUTES,
  isReauthFresh,
  reauthExpiresAt,
  readElevationToken,
  verifyElevation,
} from "@/lib/admin/elevation";

export const runtime = "nodejs";

// GET /api/admin/security/session — "where do I stand?" for the admin shell.
//
// Two jobs:
//  1. The unlock page probes it on load. SameSite=Strict means a top-level
//     navigation from OFF-SITE (a link in an email) arrives without the
//     elevation cookie, so an already-unlocked admin would otherwise be asked
//     for the passphrase again for no reason. This same-origin fetch DOES carry
//     the cookie, so the page can send them straight through.
//  2. The shell's countdown chip reads it to show when the panel re-locks.
//
// Never returns anything secret: no hash, no token, no other admin's state.
export async function GET(request: Request) {
  const gate = await requireAdminIdentity(request);
  if (!gate.ok) return gate.response;
  const { user, admin } = gate.ctx;

  const [credential, check] = await Promise.all([
    readCredential(admin, user.id).catch(() => null),
    verifyElevation(admin, user.id, await readElevationToken()).catch(
      () => ({ status: "expired" }) as const
    ),
  ]);

  const elevated = check.status === "ok";
  return NextResponse.json({
    enrollment: enrollmentState(credential),
    lockedForSeconds: lockRemainingSeconds(credential),
    elevated,
    idleMinutes: ELEVATION_IDLE_MINUTES,
    expiresAt: elevated ? check.session.expiresAt : null,
    reauthFresh: elevated ? isReauthFresh(check.session) : false,
    reauthExpiresAt: elevated ? reauthExpiresAt(check.session) : null,
  });
}
