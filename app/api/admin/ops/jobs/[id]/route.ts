import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import { guardAdminMutation, parseBody } from "@/lib/admin/mutation";
import { writeAudit } from "@/lib/admin/audit";

export const runtime = "nodejs";

const schema = z.object({ action: z.enum(["retry", "cancel"]) });

// POST /api/admin/ops/jobs/[id] — retry (re-queue, reset attempts + lock) or
// cancel (mark failed) a job. Only queued/running/failed jobs are actionable;
// a done job is left alone.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { admin, user, ip, userAgent } = gate.ctx;
  const { id } = await params;

  const over = await guardAdminMutation(gate.ctx);
  if (over) return over;

  const body = await parseBody(request, schema);
  if (!body.ok) return body.response;

  const { data: job } = await admin.from("jobs").select("id, status, kind").eq("id", id).maybeSingle();
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const now = new Date().toISOString();
  const patch =
    body.data.action === "retry"
      ? {
          status: "queued",
          attempts: 0,
          locked_at: null,
          locked_by: null,
          last_error: null,
          run_at: now,
          updated_at: now,
        }
      : { status: "failed", last_error: "cancelled by admin", locked_at: null, locked_by: null, updated_at: now };

  const { error } = await admin.from("jobs").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: "Failed to update job." }, { status: 500 });

  await writeAudit(admin, {
    adminId: user.id,
    action: `job.${body.data.action}`,
    targetType: "job",
    targetId: id,
    payload: { kind: job.kind, from: job.status },
    ip,
    userAgent,
  });

  return NextResponse.json({ ok: true, action: body.data.action });
}
