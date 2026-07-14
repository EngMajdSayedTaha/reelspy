import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import { guardAdminMutation, parseBody } from "@/lib/admin/mutation";
import { writeAudit } from "@/lib/admin/audit";

export const runtime = "nodejs";

// GET /api/admin/users/[id]/notes — list support notes for a user (newest first).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { admin } = gate.ctx;
  const { id } = await params;

  const { data } = await admin
    .from("admin_notes")
    .select("id, note, admin_id, created_at")
    .eq("user_id", id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ notes: data ?? [] });
}

const postSchema = z.object({ note: z.string().trim().min(1).max(4000) });

// POST /api/admin/users/[id]/notes — attach a support note.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { admin, user, ip, userAgent } = gate.ctx;
  const { id } = await params;

  const over = await guardAdminMutation(gate.ctx);
  if (over) return over;

  const body = await parseBody(request, postSchema);
  if (!body.ok) return body.response;

  const { data, error } = await admin
    .from("admin_notes")
    .insert({ user_id: id, admin_id: user.id, note: body.data.note })
    .select("id, note, admin_id, created_at")
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: "Failed to add note." }, { status: 500 });
  }

  await writeAudit(admin, {
    adminId: user.id,
    action: "user.note_add",
    targetType: "user",
    targetId: id,
    payload: { noteId: data?.id ?? null },
    ip,
    userAgent,
  });

  return NextResponse.json({ ok: true, note: data });
}

const deleteSchema = z.object({ noteId: z.string().uuid() });

// DELETE /api/admin/users/[id]/notes — remove a support note by id.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { admin, user, ip, userAgent } = gate.ctx;
  const { id } = await params;

  const over = await guardAdminMutation(gate.ctx);
  if (over) return over;

  const body = await parseBody(request, deleteSchema);
  if (!body.ok) return body.response;

  const { error } = await admin
    .from("admin_notes")
    .delete()
    .eq("id", body.data.noteId)
    .eq("user_id", id);
  if (error) {
    return NextResponse.json({ error: "Failed to delete note." }, { status: 500 });
  }

  await writeAudit(admin, {
    adminId: user.id,
    action: "user.note_delete",
    targetType: "user",
    targetId: id,
    payload: { noteId: body.data.noteId },
    ip,
    userAgent,
  });

  return NextResponse.json({ ok: true });
}
