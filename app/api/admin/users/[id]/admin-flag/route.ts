import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import { guardAdminMutation, parseBody } from "@/lib/admin/mutation";
import { writeAudit } from "@/lib/admin/audit";

export const runtime = "nodejs";

const schema = z.object({ is_admin: z.boolean() });

// POST /api/admin/users/[id]/admin-flag — grant/revoke the founder admin flag.
// An admin can never revoke their OWN flag (would lock themselves out of the
// panel with no in-app way back), enforced server-side.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { admin, user, ip, userAgent } = gate.ctx;
  const { id } = await params;

  const over = await guardAdminMutation(gate.ctx);
  if (over) return over;

  const body = await parseBody(request, schema);
  if (!body.ok) return body.response;

  if (id === user.id && body.data.is_admin === false) {
    return NextResponse.json({ error: "You cannot remove your own admin access." }, { status: 400 });
  }

  const { data: before } = await admin
    .from("profiles")
    .select("is_admin")
    .eq("id", id)
    .maybeSingle();
  if (!before) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { error } = await admin
    .from("profiles")
    .update({ is_admin: body.data.is_admin })
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: "Failed to update admin flag." }, { status: 500 });
  }

  await writeAudit(admin, {
    adminId: user.id,
    action: "user.admin_flag",
    targetType: "user",
    targetId: id,
    payload: { from: before.is_admin === true, to: body.data.is_admin },
    ip,
    userAgent,
  });

  return NextResponse.json({ ok: true, is_admin: body.data.is_admin });
}
