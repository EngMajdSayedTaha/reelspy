import { NextResponse } from "next/server";
import { requireAdminIdentity } from "@/lib/admin/auth";
import { writeAudit } from "@/lib/admin/audit";
import {
  clearElevationCookie,
  readElevationToken,
  revokeElevation,
  verifyElevation,
} from "@/lib/admin/elevation";

export const runtime = "nodejs";

// POST /api/admin/security/lock — end this elevation now.
//
// The "I'm done" button in the admin shell, and the thing to hit when a laptop
// is about to leave your hands. Revokes the row (so the cookie is dead even if
// it is copied off the machine first) and clears the cookie. Signing out is not
// a substitute: the elevation is a separate credential with its own lifetime.
//
// Uses the identity gate, not requireAdmin: locking an already-expired panel
// must still succeed and still clear the cookie, or a half-dead elevation
// sticks around with no way to clean it up from the UI.
export async function POST(request: Request) {
  const gate = await requireAdminIdentity(request);
  if (!gate.ok) return gate.response;
  const { user, admin, ip, userAgent } = gate.ctx;

  const check = await verifyElevation(admin, user.id, await readElevationToken()).catch(
    () => ({ status: "expired" }) as const
  );

  if (check.status === "ok") {
    await revokeElevation(admin, check.session.id, "locked_by_admin");
    await writeAudit(admin, {
      adminId: user.id,
      action: "admin.lock",
      targetType: "admin_session",
      targetId: check.session.id,
      payload: {},
      ip,
      userAgent,
    });
  }

  const response = NextResponse.json({ ok: true, elevated: false });
  clearElevationCookie(response);
  return response;
}
