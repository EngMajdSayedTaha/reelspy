import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import { guardAdminMutation, parseBody } from "@/lib/admin/mutation";
import { writeAudit } from "@/lib/admin/audit";
import {
  clearElevationCookie,
  listElevations,
  revokeAllElevations,
  revokeElevation,
} from "@/lib/admin/elevation";

export const runtime = "nodejs";

// The elevated sessions behind /admin/security.
//
//   GET  → every live elevation for the calling admin (never another admin's:
//          one founder's device list is not the next one's business).
//   POST → revoke one by id, or all of them.
//
// "Which devices can currently act as me?" is the question you ask when a phone
// goes missing, and "not this one any more" has to be answerable in a click.
export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { admin, user, elevation } = gate.ctx;

  const sessions = await listElevations(admin, user.id, elevation.id);
  return NextResponse.json({ sessions });
}

const schema = z.union([
  z.object({ id: z.string().uuid() }),
  z.object({ all: z.literal(true) }),
]);

export async function POST(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { admin, user, elevation, ip, userAgent } = gate.ctx;

  const over = await guardAdminMutation(gate.ctx);
  if (over) return over;

  const body = await parseBody(request, schema);
  if (!body.ok) return body.response;

  if ("all" in body.data) {
    // Includes this one: "sign out everywhere" that spares the device you're
    // holding isn't what anyone means by it, and the cookie is cleared below so
    // the panel re-locks immediately rather than half-working.
    const revoked = await revokeAllElevations(admin, user.id, "revoke_all");
    await writeAudit(admin, {
      adminId: user.id,
      action: "admin.sessions_revoked",
      targetType: "admin_session",
      targetId: null,
      payload: { scope: "all", count: revoked },
      ip,
      userAgent,
    });
    const response = NextResponse.json({ ok: true, revoked, selfRevoked: true });
    clearElevationCookie(response);
    return response;
  }

  const { id } = body.data;
  // Scoped to this admin's own rows: an id from somewhere else must not revoke
  // another admin's elevation.
  const own = await listElevations(admin, user.id, elevation.id);
  if (!own.some((session) => session.id === id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await revokeElevation(admin, id, "revoked_by_admin");
  await writeAudit(admin, {
    adminId: user.id,
    action: "admin.sessions_revoked",
    targetType: "admin_session",
    targetId: id,
    payload: { scope: "one", self: id === elevation.id },
    ip,
    userAgent,
  });

  const response = NextResponse.json({ ok: true, revoked: 1, selfRevoked: id === elevation.id });
  if (id === elevation.id) clearElevationCookie(response);
  return response;
}
