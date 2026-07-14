import { NextResponse } from "next/server";
import { requireAdmin, adminNotFound } from "@/lib/admin/auth";
import { guardAdminMutation } from "@/lib/admin/mutation";
import { writeAudit } from "@/lib/admin/audit";
import { getResource } from "@/lib/admin/resources";

export const runtime = "nodejs";

// GET /api/admin/content/[resource]/[id] — one row (allowlisted columns only).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ resource: string; id: string }> }
) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { admin } = gate.ctx;

  const { resource, id } = await params;
  const def = getResource(resource);
  if (!def) return adminNotFound();

  const { data, error } = await admin
    .from(def.table)
    .select(def.columns.join(", "))
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Failed to load row." }, { status: 500 });
  if (!data) return adminNotFound();

  return NextResponse.json({ row: data });
}

// DELETE /api/admin/content/[resource]/[id] — delete one row if the resource is
// deletable. Snapshots the row into the audit payload first.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ resource: string; id: string }> }
) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { admin, user, ip, userAgent } = gate.ctx;

  const { resource, id } = await params;
  const def = getResource(resource);
  if (!def) return adminNotFound();
  if (!def.deletable) {
    return NextResponse.json({ error: "This resource is read-only." }, { status: 400 });
  }

  const over = await guardAdminMutation(gate.ctx);
  if (over) return over;

  // Snapshot before delete for the audit trail.
  const { data: snapshot } = await admin
    .from(def.table)
    .select(def.columns.join(", "))
    .eq("id", id)
    .maybeSingle();
  if (!snapshot) return adminNotFound();

  const { error } = await admin.from(def.table).delete().eq("id", id);
  if (error) return NextResponse.json({ error: "Failed to delete row." }, { status: 500 });

  await writeAudit(admin, {
    adminId: user.id,
    action: "content.delete",
    targetType: `content:${def.table}`,
    targetId: id,
    payload: { snapshot },
    ip,
    userAgent,
  });

  return NextResponse.json({ ok: true });
}
