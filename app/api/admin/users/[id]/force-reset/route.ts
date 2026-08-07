import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import { guardAdminMutation, parseBody } from "@/lib/admin/mutation";
import { writeAudit } from "@/lib/admin/audit";

export const runtime = "nodejs";

const schema = z.object({ reset: z.boolean(), reason: z.string().max(500).optional() });

// POST /api/admin/users/[id]/force-reset — require (or cancel requiring) a
// password reset before this user can use the app again. Setting reset:true
// flags profiles.force_password_reset (checked by middleware.ts on every
// /dashboard navigation) and revokes their existing sessions via the
// admin_revoke_user_sessions RPC (auth.sessions isn't reachable from the
// service-role REST client directly — see migration force_password_reset for
// why). reset:false clears the flag without touching sessions — an override
// for a mistaken flag, not a substitute for the user completing /reset-password.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { admin, user, ip, userAgent } = gate.ctx;
  const { id } = await params;

  const over = await guardAdminMutation(gate.ctx);
  if (over) return over;

  const body = await parseBody(request, schema);
  if (!body.ok) return body.response;
  const { reset, reason } = body.data;

  const { error } = await admin
    .from("profiles")
    .update({
      force_password_reset: reset,
      force_password_reset_at: reset ? new Date().toISOString() : null,
      force_password_reset_reason: reset ? (reason ?? null) : null,
    })
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: "Failed to update reset flag." }, { status: 500 });
  }

  if (reset) {
    const { error: sessionError } = await admin.rpc("admin_revoke_user_sessions", { target_user: id });
    if (sessionError) {
      console.warn(`[force-reset] failed to revoke sessions for ${id}:`, sessionError.message);
    }
  }

  await writeAudit(admin, {
    adminId: user.id,
    action: reset ? "user.force_password_reset" : "user.force_password_reset_cancel",
    targetType: "user",
    targetId: id,
    payload: { reason: reason ?? null },
    ip,
    userAgent,
  });

  return NextResponse.json({ ok: true, reset });
}
