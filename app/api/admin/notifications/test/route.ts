import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { guardAdminMutation } from "@/lib/admin/mutation";
import { writeAudit } from "@/lib/admin/audit";
import { emailConfigured } from "@/lib/email/send";
import { sendAlertEmail } from "@/lib/notifications/email";
import { readAdminNotificationPrefs, resolveRecipients } from "@/lib/notifications/prefs";

export const runtime = "nodejs";

// POST /api/admin/notifications/test — prove the pipe works.
//
// Deliberately NOT routed through notifyAdmins: a test must bypass the severity
// floor, quiet hours, throttling and the digest, or the button would sometimes
// do nothing and teach the founder to distrust it. It also writes no alert row —
// a test is not an event, and seeding the inbox with fake incidents would make
// the log worth less.
//
// It does still resolve recipients the real way, so what it proves is the thing
// that matters: "mail addressed like a real alert reaches these inboxes".
export async function POST(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { admin, user, ip, userAgent } = gate.ctx;

  const over = await guardAdminMutation(gate.ctx);
  if (over) return over;

  const prefs = await readAdminNotificationPrefs(admin);
  const recipients = resolveRecipients(prefs);

  if (!emailConfigured()) {
    return NextResponse.json(
      {
        error:
          "No mailer configured. Set RESEND_API_KEY and EMAIL_FROM on the deployment, then try again.",
      },
      { status: 400 }
    );
  }
  if (recipients.length === 0) {
    return NextResponse.json(
      { error: "No recipients. Add an address above (or set ADMIN_ALERT_EMAIL)." },
      { status: 400 }
    );
  }

  const sent = await sendAlertEmail(recipients, {
    event: "test",
    category: "reliability",
    severity: "info",
    title: "Test alert — your alerting works",
    summary:
      "This is what an alert looks like. If it reached you, every event switched on in Admin → Notifications will reach you the same way.",
    context: {
      "Sent by": user.email ?? user.id,
      Recipients: recipients.join(", "),
      "Sent at": new Date().toUTCString(),
    },
    link: "/admin/notifications",
  });

  await writeAudit(admin, {
    adminId: user.id,
    action: "notifications.test",
    targetType: "app_setting",
    targetId: "admin_notifications",
    payload: { recipients, sent },
    ip,
    userAgent,
  });

  if (!sent) {
    return NextResponse.json(
      { error: "The mail provider refused the message. Check the server logs for the reason." },
      { status: 502 }
    );
  }
  return NextResponse.json({ ok: true, recipients });
}
