import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import { guardAdminMutation, parseBody } from "@/lib/admin/mutation";
import { writeAudit } from "@/lib/admin/audit";

export const runtime = "nodejs";

const schema = z.object({ scope: z.enum(["monthly", "action", "all"]).default("all") });

// POST /api/admin/users/[id]/usage — reset a user's rate-limit/quota counters.
// scope=monthly clears user_monthly_usage (script/transcript quotas), scope=action
// clears user_action_usage (per-hour action throttles), scope=all clears both.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { admin, user, ip, userAgent } = gate.ctx;
  const { id } = await params;

  const over = await guardAdminMutation(gate.ctx);
  if (over) return over;

  const body = await parseBody(request, schema);
  if (!body.ok) return body.response;
  const scope = body.data.scope;

  if (scope === "monthly" || scope === "all") {
    await admin.from("user_monthly_usage").delete().eq("user_id", id);
  }
  if (scope === "action" || scope === "all") {
    await admin.from("user_action_usage").delete().eq("user_id", id);
  }

  await writeAudit(admin, {
    adminId: user.id,
    action: "user.usage_reset",
    targetType: "user",
    targetId: id,
    payload: { scope },
    ip,
    userAgent,
  });

  return NextResponse.json({ ok: true, scope });
}
