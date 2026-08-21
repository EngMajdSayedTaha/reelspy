import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import { guardAdminMutation, parseBody } from "@/lib/admin/mutation";
import { writeAudit } from "@/lib/admin/audit";
import { notifyAdmins } from "@/lib/notifications/notify";

export const runtime = "nodejs";

const schema = z.object({ reason: z.string().max(500).optional(), confirm: z.literal("RESET ALL") });

// POST /api/admin/users/force-reset-all — flag every user for a required
// password reset (e.g. a suspected credential leak) and revoke every
// existing session except the acting admin's own, so they aren't logged out
// mid-operation. Every other flagged user hits the same middleware.ts gate as
// a single force-reset the next time they touch /dashboard. Requires the
// literal confirm phrase "RESET ALL" (enforced by the UI's TypeToConfirm
// dialog) given the blast radius.
export async function POST(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { admin, user, ip, userAgent } = gate.ctx;

  const over = await guardAdminMutation(gate.ctx);
  if (over) return over;

  const body = await parseBody(request, schema);
  if (!body.ok) return body.response;
  const { reason } = body.data;

  const now = new Date().toISOString();
  // .neq on a UUID no profile can ever have satisfies PostgREST's "at least
  // one filter" requirement on UPDATE while still matching every real row.
  const { error, count } = await admin
    .from("profiles")
    .update(
      {
        force_password_reset: true,
        force_password_reset_at: now,
        force_password_reset_reason: reason ?? null,
      },
      { count: "exact" }
    )
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) {
    return NextResponse.json({ error: "Failed to flag users for password reset." }, { status: 500 });
  }

  const { error: sessionError } = await admin.rpc("admin_revoke_all_sessions", { exclude_user_id: user.id });
  if (sessionError) {
    console.warn("[force-reset-all] failed to revoke sessions:", sessionError.message);
  }

  await writeAudit(admin, {
    adminId: user.id,
    action: "user.force_password_reset_all",
    targetType: "user",
    targetId: null,
    payload: { reason: reason ?? null, affected: count ?? null },
    ip,
    userAgent,
  });

  // The largest blast radius any admin action in this product has: every
  // customer is logged out and forced through a password reset. If this fires
  // and no admin meant to do it, that is an incident.
  await notifyAdmins(
    "auth.force_reset_all",
    {
      title: `Password reset forced on ${count ?? "all"} users`,
      summary:
        "Every session except the acting admin's was revoked and every account must set a new password before it can use the product again.",
      context: {
        "By admin": user.email ?? user.id,
        "Accounts affected": count ?? undefined,
        Reason: reason ?? undefined,
        "Sessions revoked": sessionError ? "failed — see logs" : "yes",
      },
      link: "/admin/users",
    },
    { admin }
  );

  return NextResponse.json({ ok: true, affected: count ?? null });
}
