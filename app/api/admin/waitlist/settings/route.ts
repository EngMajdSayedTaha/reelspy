import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import { guardAdminMutation, parseBody } from "@/lib/admin/mutation";
import { writeAudit } from "@/lib/admin/audit";
import {
  WAITLIST_FLAG_KEY,
  nextWaitlistFlag,
  readWaitlistFlag,
} from "@/lib/waitlist/flag";

export const runtime = "nodejs";

// The on/off switch, as a first-class endpoint rather than a raw JSON blob in
// the generic settings panel. Same app_settings row underneath (`flag:waitlist`,
// still hand-editable there), but this one enforces the shape, stamps the
// grandfather cutoff on every OFF→ON transition, and audits the change — which
// a free-text JSON editor cannot do.

// GET /api/admin/waitlist/settings
export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;

  const flag = await readWaitlistFlag(gate.ctx.admin);
  return NextResponse.json({ flag });
}

const patchSchema = z
  .object({
    enabled: z.boolean().optional(),
    autoApprove: z.boolean().optional(),
    sendEmails: z.boolean().optional(),
  })
  // `enabledSince` is intentionally absent: it's derived, never client-supplied.
  // Letting a client set it would let it move the grandfather cutoff forward and
  // lock out existing customers.
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to change." });

// PUT /api/admin/waitlist/settings
export async function PUT(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { admin, user, ip, userAgent } = gate.ctx;

  const over = await guardAdminMutation(gate.ctx);
  if (over) return over;

  const body = await parseBody(request, patchSchema);
  if (!body.ok) return body.response;

  const current = await readWaitlistFlag(admin);
  const next = nextWaitlistFlag(current, body.data, new Date().toISOString());

  const { error } = await admin.from("app_settings").upsert(
    { key: WAITLIST_FLAG_KEY, value: next, updated_at: new Date().toISOString() },
    { onConflict: "key" }
  );
  if (error) {
    return NextResponse.json({ error: "Couldn't save the waitlist setting." }, { status: 500 });
  }

  await writeAudit(admin, {
    adminId: user.id,
    action: current.enabled === next.enabled ? "waitlist.settings" : next.enabled ? "waitlist.enable" : "waitlist.disable",
    targetType: "app_setting",
    targetId: WAITLIST_FLAG_KEY,
    payload: { before: current, after: next },
    ip,
    userAgent,
  });

  return NextResponse.json({ ok: true, flag: next });
}
