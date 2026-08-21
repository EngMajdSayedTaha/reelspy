import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { guardAdminMutation } from "@/lib/admin/mutation";
import { writeAudit } from "@/lib/admin/audit";
import { flushDigest } from "@/lib/notifications/alerts";

export const runtime = "nodejs";

// POST /api/admin/notifications/digest — send the batched alerts NOW.
//
// The same flush the hourly cron performs, with the interval check forced off.
// Exists because "what's waiting in the digest?" is a question a founder asks
// during an incident, and the honest answer is the email itself.
export async function POST(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { admin, user, ip, userAgent } = gate.ctx;

  const over = await guardAdminMutation(gate.ctx);
  if (over) return over;

  const result = await flushDigest(admin, { force: true });

  await writeAudit(admin, {
    adminId: user.id,
    action: "notifications.digest_flush",
    targetType: "app_setting",
    targetId: "admin_notifications",
    payload: { ...result },
    ip,
    userAgent,
  });

  const message: Record<typeof result.status, string> = {
    sent: `Digest sent — ${result.alerts} alert${result.alerts === 1 ? "" : "s"}.`,
    empty: "Nothing is waiting in the digest.",
    too_soon: "Not due yet.",
    disabled: "The digest is switched off.",
    not_configured: "No mailer or no recipients configured.",
    send_failed: "The mail provider refused the digest. The alerts stay queued for the next run.",
  };

  const ok = result.status === "sent" || result.status === "empty";
  return NextResponse.json(
    ok ? { ok: true, ...result, message: message[result.status] } : { error: message[result.status] },
    { status: ok ? 200 : 400 }
  );
}
