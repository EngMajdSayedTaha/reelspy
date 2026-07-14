import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import { guardAdminMutation, parseBody } from "@/lib/admin/mutation";
import { writeAudit } from "@/lib/admin/audit";

export const runtime = "nodejs";

// Keys whose value holds a secret (IG session cookies) — never returned raw;
// the GET masks them to a safe summary.
const SECRET_KEYS = new Set(["ig_cookies"]);
// Non-flag keys an admin may edit through this endpoint. Everything under the
// "flag:" prefix is editable too (feature flags). Nothing else is writable here.
const SAFE_EDITABLE_KEYS = new Set<string>([]);

function isEditable(key: string): boolean {
  return key.startsWith("flag:") || SAFE_EDITABLE_KEYS.has(key);
}

// Reduce a secret-bearing value to non-sensitive summary fields only.
function maskValue(key: string, value: unknown): unknown {
  if (!SECRET_KEYS.has(key)) return value;
  const v = (value ?? {}) as Record<string, unknown>;
  return {
    _redacted: true,
    updated_by: v.updated_by ?? null,
    last_ok_at: v.last_ok_at ?? null,
    last_error: v.last_error ?? null,
    last_error_at: v.last_error_at ?? null,
    rotations: v.rotations ?? null,
  };
}

// GET /api/admin/ops/settings — all app_settings rows (secret values masked).
export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { admin } = gate.ctx;

  const { data } = await admin
    .from("app_settings")
    .select("key, value, updated_at")
    .order("key", { ascending: true });

  const settings = ((data ?? []) as { key: string; value: unknown; updated_at: string }[]).map(
    (row) => ({
      key: row.key,
      value: maskValue(row.key, row.value),
      updated_at: row.updated_at,
      editable: isEditable(row.key),
      secret: SECRET_KEYS.has(row.key),
    })
  );

  return NextResponse.json({ settings });
}

const putSchema = z.object({
  key: z.string().min(1).max(200),
  value: z.unknown(),
});

// PUT /api/admin/ops/settings — upsert one editable setting (feature flags +
// the safe-key allowlist only). Secret keys and unknown keys are rejected.
export async function PUT(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { admin, user, ip, userAgent } = gate.ctx;

  const over = await guardAdminMutation(gate.ctx);
  if (over) return over;

  const body = await parseBody(request, putSchema);
  if (!body.ok) return body.response;

  const { key, value } = body.data;
  if (SECRET_KEYS.has(key) || !isEditable(key)) {
    return NextResponse.json({ error: "This setting is not editable here." }, { status: 400 });
  }

  const { data: before } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();

  const { error } = await admin
    .from("app_settings")
    .upsert({ key, value: value ?? {}, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) return NextResponse.json({ error: "Failed to save setting." }, { status: 500 });

  await writeAudit(admin, {
    adminId: user.id,
    action: "settings.update",
    targetType: "app_setting",
    targetId: key,
    payload: { before: before?.value ?? null, after: value ?? {} },
    ip,
    userAgent,
  });

  return NextResponse.json({ ok: true, key });
}
