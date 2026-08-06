import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import { guardAdminMutation, parseBody } from "@/lib/admin/mutation";
import { writeAudit } from "@/lib/admin/audit";
import { readWaitlistFlag } from "@/lib/waitlist/flag";
import { REVIEW_STATUSES, reviewEntry } from "@/lib/waitlist/review";

export const runtime = "nodejs";

// Letting people in happens in BATCHES — that's the whole operating model of a
// waiting list — so one-at-a-time clicking would be the actual product failure
// here. Capped at 200 ids: past that this is a mail-send loop inside a
// serverless request, and the honest answer is "do it in two batches".
const MAX_IDS = 200;

const schema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(MAX_IDS),
  status: z.enum(REVIEW_STATUSES),
});

// POST /api/admin/waitlist/bulk — apply one status to many entries.
export async function POST(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { admin, user, ip, userAgent } = gate.ctx;

  const over = await guardAdminMutation(gate.ctx);
  if (over) return over;

  const body = await parseBody(request, schema);
  if (!body.ok) return body.response;
  const { ids, status } = body.data;

  const flag = await readWaitlistFlag(admin);

  // Sequential, not Promise.all: approving sends an email per entry, and firing
  // 200 Resend calls at once is how you get rate-limited by the provider and
  // lose half the batch. A couple of seconds for a batch this size is fine.
  let changed = 0;
  let emailed = 0;
  const failed: string[] = [];

  for (const id of ids) {
    const result = await reviewEntry(admin, id, status, {
      reviewedBy: user.id,
      sendEmails: flag.sendEmails,
    });
    if (!result) {
      failed.push(id);
      continue;
    }
    changed += 1;
    if (result.emailSent) emailed += 1;
  }

  await writeAudit(admin, {
    adminId: user.id,
    action: "waitlist.bulk",
    targetType: "waitlist_entry",
    targetId: null,
    payload: { status, requested: ids.length, changed, emailed, failed: failed.length },
    ip,
    userAgent,
  });

  return NextResponse.json({ ok: true, changed, emailed, failed: failed.length });
}
