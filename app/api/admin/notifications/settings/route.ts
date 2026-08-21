import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import { guardAdminMutation, parseBody } from "@/lib/admin/mutation";
import { writeAudit } from "@/lib/admin/audit";
import { ALERT_EVENT_KEYS, SEVERITIES, eventsByCategory } from "@/lib/notifications/catalog";
import {
  MAX_RECIPIENTS,
  MAX_THROTTLE_MINUTES,
  nextAdminNotificationPrefs,
  readAdminNotificationPrefs,
  resolveRecipients,
  resolvedEventPrefs,
  writeAdminNotificationPrefs,
} from "@/lib/notifications/prefs";
import { alertCounts } from "@/lib/notifications/alerts";
import { readAlertingState } from "@/lib/notifications/state";
import { emailConfigured } from "@/lib/email/send";

export const runtime = "nodejs";

// The alert preferences endpoint. Same app_settings row underneath as every
// other setting, but this one owns the shape: the generic ops panel can't
// validate a severity ladder, drop event keys that left the catalog, or audit
// the diff — and getting any of those wrong here means alerts silently stop.

// GET /api/admin/notifications/settings
// Returns the prefs, the catalog to render them against, and enough
// environment truth (is a mailer configured? who would actually receive this?)
// that the page can warn instead of pretending it's set up.
export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { admin } = gate.ctx;

  const prefs = await readAdminNotificationPrefs(admin);
  const [counts, state] = await Promise.all([alertCounts(admin), readAlertingState(admin)]);

  return NextResponse.json({
    prefs,
    // The merged view the matrix renders: catalog metadata + effective routing.
    events: resolvedEventPrefs(prefs),
    categories: eventsByCategory().map((g) => g.category),
    counts,
    delivery: {
      emailConfigured: emailConfigured(),
      // What the fallback resolves to, so the page can say "going to X (from
      // ADMIN_ALERT_EMAIL)" rather than showing an empty recipients list.
      effectiveRecipients: resolveRecipients(prefs),
      usingEnvFallback: prefs.recipients.length === 0,
      lastDigestAt: state.lastDigestAt,
    },
  });
}

const eventPatchSchema = z.object({
  enabled: z.boolean().optional(),
  digest: z.boolean().optional(),
  throttleMinutes: z.number().int().min(0).max(MAX_THROTTLE_MINUTES).optional(),
});

const patchSchema = z
  .object({
    enabled: z.boolean().optional(),
    recipients: z.array(z.string().trim().email().max(254)).max(MAX_RECIPIENTS).optional(),
    minSeverity: z.enum(SEVERITIES).optional(),
    quietHours: z
      .object({
        enabled: z.boolean().optional(),
        startHour: z.number().int().min(0).max(23).optional(),
        endHour: z.number().int().min(0).max(23).optional(),
        utcOffsetMinutes: z.number().int().min(-720).max(840).optional(),
      })
      .optional(),
    digest: z
      .object({
        enabled: z.boolean().optional(),
        intervalHours: z.number().int().min(1).max(24).optional(),
      })
      .optional(),
    // Only catalog keys are accepted — an unknown key is a typo or a stale
    // client, and silently storing it would show up as a phantom row later.
    events: z.record(z.enum(ALERT_EVENT_KEYS as [string, ...string[]]), eventPatchSchema).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to change." });

// PUT /api/admin/notifications/settings — partial patch, merged and normalized.
export async function PUT(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { admin, user, ip, userAgent } = gate.ctx;

  const over = await guardAdminMutation(gate.ctx);
  if (over) return over;

  const body = await parseBody(request, patchSchema);
  if (!body.ok) return body.response;

  const current = await readAdminNotificationPrefs(admin);
  const next = nextAdminNotificationPrefs(current, body.data);

  const saved = await writeAdminNotificationPrefs(admin, next);
  if (!saved) {
    return NextResponse.json({ error: "Couldn't save the alert settings." }, { status: 500 });
  }

  await writeAudit(admin, {
    adminId: user.id,
    action: "notifications.settings",
    targetType: "app_setting",
    targetId: "admin_notifications",
    payload: { before: current, after: next },
    ip,
    userAgent,
  });

  return NextResponse.json({
    ok: true,
    prefs: next,
    events: resolvedEventPrefs(next),
    delivery: {
      emailConfigured: emailConfigured(),
      effectiveRecipients: resolveRecipients(next),
      usingEnvFallback: next.recipients.length === 0,
    },
  });
}
