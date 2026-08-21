import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import { guardAdminMutation, parseBody } from "@/lib/admin/mutation";
import { writeAudit } from "@/lib/admin/audit";
import {
  ALERT_CATEGORIES,
  SEVERITIES,
  type AlertCategory,
  type Severity,
} from "@/lib/notifications/catalog";
import {
  ALERT_PAGE_SIZE,
  alertCounts,
  listAlerts,
  markAlertsRead,
  reopenAlerts,
  resolveAlerts,
} from "@/lib/notifications/alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The alert inbox: the feed itself plus the three things an admin does to it
// (mark read, resolve, reopen). Read state is per-INSTALLATION, not per-admin —
// this is a founder tool with one or two operators, and a per-admin read table
// would be real complexity bought for nobody.

// GET /api/admin/notifications/alerts?severity=&category=&unresolved=&before=
export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { admin } = gate.ctx;

  const url = new URL(request.url);

  // `?counts=1` is the sidebar badge's query: the five head-only counts and no
  // rows at all, so the chrome on every admin page doesn't pay for a page of
  // alerts it never renders.
  if (url.searchParams.get("counts") === "1") {
    return NextResponse.json({ counts: await alertCounts(admin) });
  }

  const severityParam = url.searchParams.get("severity");
  const categoryParam = url.searchParams.get("category");
  const limitParam = Number(url.searchParams.get("limit"));

  const { alerts, nextCursor } = await listAlerts(admin, {
    severity: SEVERITIES.includes(severityParam as Severity) ? (severityParam as Severity) : null,
    category: ALERT_CATEGORIES.includes(categoryParam as AlertCategory)
      ? (categoryParam as AlertCategory)
      : null,
    unresolvedOnly: url.searchParams.get("unresolved") === "1",
    before: url.searchParams.get("before"),
    limit: Number.isFinite(limitParam) && limitParam > 0 ? limitParam : ALERT_PAGE_SIZE,
  });

  return NextResponse.json({ alerts, nextCursor, counts: await alertCounts(admin) });
}

const patchSchema = z
  .object({
    action: z.enum(["read", "resolve", "reopen"]),
    ids: z.array(z.string().uuid()).max(200).optional(),
    /** `read` only: acknowledge the whole inbox in one click. */
    all: z.boolean().optional(),
  })
  .refine((v) => v.all === true || (v.ids?.length ?? 0) > 0, {
    message: "Pass ids, or all: true.",
  });

// PATCH /api/admin/notifications/alerts
export async function PATCH(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { admin, user, ip, userAgent } = gate.ctx;

  const over = await guardAdminMutation(gate.ctx);
  if (over) return over;

  const body = await parseBody(request, patchSchema);
  if (!body.ok) return body.response;
  const { action, ids = [], all } = body.data;

  let changed = 0;
  if (action === "read") {
    changed = await markAlertsRead(admin, { ids, all });
  } else if (action === "resolve") {
    changed = await resolveAlerts(admin, ids, user.id);
  } else {
    changed = await reopenAlerts(admin, ids);
  }

  // Marking things read is bookkeeping, not a decision — auditing every scroll
  // would bury the entries that matter. Resolving IS a decision: it's how the
  // record says a chargeback or a dead queue was dealt with, and by whom.
  if (action !== "read") {
    await writeAudit(admin, {
      adminId: user.id,
      action: `alerts.${action}`,
      targetType: "admin_alert",
      targetId: ids.length === 1 ? ids[0]! : null,
      payload: { ids, changed },
      ip,
      userAgent,
    });
  }

  return NextResponse.json({ ok: true, changed, counts: await alertCounts(admin) });
}
