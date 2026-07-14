import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Append-only audit writer. Called after a successful admin mutation with the
// service-role client (which bypasses RLS on admin_audit_log). Best-effort by
// design: it logs and swallows any error instead of throwing, because
// supabase-js has no cross-statement transaction, so we must never let a failed
// audit insert roll back — or appear to roll back — a mutation that already
// committed. A missing audit row is a monitoring problem; a 500 after the real
// change landed is a correctness problem.

export type AuditEntry = {
  adminId: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  payload?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
};

export async function writeAudit(admin: SupabaseClient, entry: AuditEntry): Promise<void> {
  try {
    const { error } = await admin.from("admin_audit_log").insert({
      admin_id: entry.adminId,
      action: entry.action,
      target_type: entry.targetType,
      target_id: entry.targetId ?? null,
      payload: entry.payload ?? {},
      ip: entry.ip ?? null,
      user_agent: entry.userAgent ?? null,
    });
    if (error) {
      console.warn(`[admin-audit] failed to write ${entry.action}:`, error.message);
    }
  } catch (err) {
    console.warn(`[admin-audit] threw writing ${entry.action}:`, err);
  }
}
