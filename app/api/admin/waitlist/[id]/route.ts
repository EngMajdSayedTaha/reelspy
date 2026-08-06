import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import { guardAdminMutation, parseBody } from "@/lib/admin/mutation";
import { writeAudit } from "@/lib/admin/audit";
import { readWaitlistFlag } from "@/lib/waitlist/flag";
import { REVIEW_STATUSES, reviewEntry } from "@/lib/waitlist/review";

export const runtime = "nodejs";

const patchSchema = z.object({
  status: z.enum(REVIEW_STATUSES).optional(),
  adminNote: z.string().max(2000).nullable().optional(),
});

// PATCH /api/admin/waitlist/[id] — approve / shortlist / reject / re-open one
// entry, and/or leave an internal note. Approving sends the "you're in" email
// (once, on the actual transition — see lib/waitlist/review.ts).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { admin, user, ip, userAgent } = gate.ctx;
  const { id } = await params;

  const over = await guardAdminMutation(gate.ctx);
  if (over) return over;

  const body = await parseBody(request, patchSchema);
  if (!body.ok) return body.response;
  if (!body.data.status && body.data.adminNote === undefined) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }

  const flag = await readWaitlistFlag(admin);
  const result = await reviewEntry(admin, id, body.data.status ?? "pending", {
    reviewedBy: user.id,
    adminNote: body.data.adminNote,
    sendEmails: flag.sendEmails,
  });

  if (!result) return NextResponse.json({ error: "Entry not found." }, { status: 404 });

  await writeAudit(admin, {
    adminId: user.id,
    action: `waitlist.${body.data.status ?? "note"}`,
    targetType: "waitlist_entry",
    targetId: id,
    payload: {
      email: result.entry.email,
      status: result.entry.status,
      emailSent: result.emailSent,
    },
    ip,
    userAgent,
  });

  return NextResponse.json({ ok: true, entry: result.entry, emailSent: result.emailSent });
}

// DELETE /api/admin/waitlist/[id] — remove an entry entirely.
//
// Rejecting is almost always the right action instead (it keeps the address on
// file so it can't silently rejoin at the top of the queue). Delete exists for
// genuine junk and for erasure requests, which is exactly why it's audited with
// the email it removed.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { admin, user, ip, userAgent } = gate.ctx;
  const { id } = await params;

  const over = await guardAdminMutation(gate.ctx);
  if (over) return over;

  const { data: before } = await admin
    .from("waitlist_entries")
    .select("id, email, status")
    .eq("id", id)
    .maybeSingle();
  if (!before) return NextResponse.json({ error: "Entry not found." }, { status: 404 });

  const { error } = await admin.from("waitlist_entries").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "Couldn't delete that entry." }, { status: 500 });

  await writeAudit(admin, {
    adminId: user.id,
    action: "waitlist.delete",
    targetType: "waitlist_entry",
    targetId: id,
    payload: before,
    ip,
    userAgent,
  });

  return NextResponse.json({ ok: true });
}
