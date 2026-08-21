import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import { guardAdminMutation, parseBody } from "@/lib/admin/mutation";
import { writeAudit } from "@/lib/admin/audit";
import { notifyAdmins } from "@/lib/notifications/notify";

export const runtime = "nodejs";

const schema = z.object({ banned: z.boolean(), reason: z.string().max(500).optional() });

// POST /api/admin/users/[id]/ban — ban (or unban) a user. GoTrue bans by setting
// a ban_duration; "876000h" (~100 years) is an effectively permanent ban, "none"
// lifts it. A banned user cannot sign in or refresh their session. Cannot ban self.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { admin, user, ip, userAgent } = gate.ctx;
  const { id } = await params;

  if (id === user.id) {
    return NextResponse.json({ error: "You cannot ban your own account." }, { status: 400 });
  }

  const over = await guardAdminMutation(gate.ctx);
  if (over) return over;

  const body = await parseBody(request, schema);
  if (!body.ok) return body.response;

  const { error } = await admin.auth.admin.updateUserById(id, {
    ban_duration: body.data.banned ? "876000h" : "none",
  });
  if (error) {
    return NextResponse.json({ error: `Failed to update ban: ${error.message}` }, { status: 500 });
  }

  await writeAudit(admin, {
    adminId: user.id,
    action: body.data.banned ? "user.ban" : "user.unban",
    targetType: "user",
    targetId: id,
    payload: { banned: body.data.banned, reason: body.data.reason ?? null },
    ip,
    userAgent,
  });

  // Locking a customer out is a decision the whole team should see, not just a
  // line in the audit log nobody reads until something goes wrong.
  await notifyAdmins(
    "user.banned",
    {
      title: body.data.banned ? "A user was banned" : "A user was unbanned",
      summary: body.data.reason ?? null,
      context: {
        "User id": id,
        "By admin": user.email ?? user.id,
        Reason: body.data.reason ?? undefined,
      },
      link: `/admin/users/${id}`,
    },
    { admin }
  );

  return NextResponse.json({ ok: true, banned: body.data.banned });
}
