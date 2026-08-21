// Runtime state alerting keeps for itself: when the digest last flushed.
//
// A separate app_settings row from the preferences on purpose. The digest cron
// writes this every time it runs; the admin writes preferences whenever they
// touch the settings page. Sharing one row would mean a flush landing between
// an admin's read and their Save silently reverts the timestamp — and a
// reverted timestamp means a duplicate digest.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export const ADMIN_NOTIFICATIONS_STATE_KEY = "admin_notifications_state";

export type AlertingState = {
  /** ISO of the last digest that was actually sent. Null = never. */
  lastDigestAt: string | null;
};

export const ALERTING_STATE_DEFAULT: AlertingState = { lastDigestAt: null };

export function normalizeAlertingState(value: unknown): AlertingState {
  const v = (value ?? {}) as Record<string, unknown>;
  const at = typeof v.lastDigestAt === "string" ? v.lastDigestAt : null;
  return { lastDigestAt: at && !Number.isNaN(Date.parse(at)) ? at : null };
}

export async function readAlertingState(admin: SupabaseClient): Promise<AlertingState> {
  try {
    const { data, error } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", ADMIN_NOTIFICATIONS_STATE_KEY)
      .maybeSingle();
    if (error || !data) return ALERTING_STATE_DEFAULT;
    return normalizeAlertingState(data.value);
  } catch {
    return ALERTING_STATE_DEFAULT;
  }
}

export async function writeAlertingState(
  admin: SupabaseClient,
  state: AlertingState
): Promise<void> {
  try {
    await admin.from("app_settings").upsert(
      { key: ADMIN_NOTIFICATIONS_STATE_KEY, value: state, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );
  } catch {
    // Best-effort: a lost timestamp costs one duplicate digest, never an error.
  }
}
