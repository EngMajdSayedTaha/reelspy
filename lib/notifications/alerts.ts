// Reads and writes over the alert inbox: the feed the admin page renders, the
// unread badge, the acknowledge/resolve actions, and the digest flush.
//
// Kept apart from notify.ts so the hot path (raising an alert) imports nothing
// it doesn't need, and so the query shapes the UI depends on live in one place.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SEVERITIES, alertEvent, type AlertCategory, type Severity } from "@/lib/notifications/catalog";
import { readAdminNotificationPrefs, resolveRecipients } from "@/lib/notifications/prefs";
import { readAlertingState, writeAlertingState } from "@/lib/notifications/state";
import { sendDigestEmail, type AlertMail } from "@/lib/notifications/email";
import { emailConfigured } from "@/lib/email/send";

export const ALERT_COLUMNS =
  "id, event, category, severity, title, summary, context, link, dedupe_key, repeat_count, last_seen_at, delivery, delivery_reason, emailed_at, recipients, read_at, resolved_at, created_at";

export type AdminAlert = {
  id: string;
  event: string;
  category: AlertCategory;
  severity: Severity;
  title: string;
  summary: string | null;
  context: Record<string, string>;
  link: string | null;
  dedupe_key: string | null;
  repeat_count: number;
  last_seen_at: string;
  delivery: string;
  delivery_reason: string | null;
  emailed_at: string | null;
  recipients: string[];
  read_at: string | null;
  resolved_at: string | null;
  created_at: string;
};

export type AlertFilters = {
  severity?: Severity | null;
  category?: AlertCategory | null;
  /** Only alerts nobody has resolved yet — the default working view. */
  unresolvedOnly?: boolean;
  limit?: number;
  /** Keyset cursor: `created_at` of the last row already shown. */
  before?: string | null;
};

export const ALERT_PAGE_SIZE = 25;

export async function listAlerts(
  admin: SupabaseClient,
  filters: AlertFilters = {}
): Promise<{ alerts: AdminAlert[]; nextCursor: string | null }> {
  const limit = Math.min(100, Math.max(1, filters.limit ?? ALERT_PAGE_SIZE));

  let q = admin
    .from("admin_alerts")
    .select(ALERT_COLUMNS)
    .order("created_at", { ascending: false })
    // One extra row is the "is there another page?" probe — cheaper than a
    // second count query on a table that only grows.
    .limit(limit + 1);

  if (filters.severity) q = q.eq("severity", filters.severity);
  if (filters.category) q = q.eq("category", filters.category);
  if (filters.unresolvedOnly) q = q.is("resolved_at", null);
  if (filters.before) q = q.lt("created_at", filters.before);

  const { data, error } = await q;
  if (error) return { alerts: [], nextCursor: null };

  const rows = (data ?? []) as unknown as AdminAlert[];
  const page = rows.slice(0, limit);
  const nextCursor = rows.length > limit ? (page[page.length - 1]?.created_at ?? null) : null;
  return { alerts: page, nextCursor };
}

export type AlertCounts = {
  unread: number;
  unresolved: number;
  criticalUnresolved: number;
  /** Raised in the last 24h — the "is anything on fire" number. */
  last24h: number;
  /** Batched and waiting for the next digest flush. */
  pendingDigest: number;
};

// Five head-only counts. Written out rather than routed through a generic
// helper: each has a different filter, and supabase-js query builders don't
// compose cleanly enough to be worth the indirection.
export async function alertCounts(admin: SupabaseClient): Promise<AlertCounts> {
  const since24h = new Date(Date.now() - 86_400_000).toISOString();
  const head = () => admin.from("admin_alerts").select("*", { count: "exact", head: true });

  try {
    const [unread, unresolved, critical, recent, pending] = await Promise.all([
      head().is("read_at", null),
      head().is("resolved_at", null),
      head().is("resolved_at", null).eq("severity", "critical"),
      head().gte("created_at", since24h),
      head().eq("delivery", "pending"),
    ]);
    return {
      unread: unread.count ?? 0,
      unresolved: unresolved.count ?? 0,
      criticalUnresolved: critical.count ?? 0,
      last24h: recent.count ?? 0,
      pendingDigest: pending.count ?? 0,
    };
  } catch {
    // The page must still render when the migration hasn't been applied yet.
    return { unread: 0, unresolved: 0, criticalUnresolved: 0, last24h: 0, pendingDigest: 0 };
  }
}

/** Mark one, several, or (with `all`) every unread alert as read. */
export async function markAlertsRead(
  admin: SupabaseClient,
  opts: { ids?: string[]; all?: boolean }
): Promise<number> {
  const now = new Date().toISOString();
  if (opts.all) {
    const { data } = await admin
      .from("admin_alerts")
      .update({ read_at: now })
      .is("read_at", null)
      .select("id");
    return (data ?? []).length;
  }
  const ids = (opts.ids ?? []).slice(0, 200);
  if (ids.length === 0) return 0;
  const { data } = await admin
    .from("admin_alerts")
    .update({ read_at: now })
    .in("id", ids)
    .is("read_at", null)
    .select("id");
  return (data ?? []).length;
}

/**
 * Resolve = "I dealt with this". Idempotent: re-resolving keeps the first
 * timestamp and the first admin, so the record says who actually handled it.
 */
export async function resolveAlerts(
  admin: SupabaseClient,
  ids: string[],
  adminId: string
): Promise<number> {
  const capped = ids.slice(0, 200);
  if (capped.length === 0) return 0;
  const now = new Date().toISOString();
  const { data } = await admin
    .from("admin_alerts")
    .update({ resolved_at: now, resolved_by: adminId, read_at: now })
    .in("id", capped)
    .is("resolved_at", null)
    .select("id");
  return (data ?? []).length;
}

export async function reopenAlerts(admin: SupabaseClient, ids: string[]): Promise<number> {
  const capped = ids.slice(0, 200);
  if (capped.length === 0) return 0;
  const { data } = await admin
    .from("admin_alerts")
    .update({ resolved_at: null, resolved_by: null })
    .in("id", capped)
    .select("id");
  return (data ?? []).length;
}

// ── The digest flush ─────────────────────────────────────────────────────────

export type DigestResult = {
  status: "sent" | "empty" | "too_soon" | "disabled" | "not_configured" | "send_failed";
  alerts: number;
  nextDueAt?: string | null;
};

export function digestWindowLabel(intervalHours: number): string {
  if (intervalHours >= 24) return "in the last day";
  if (intervalHours === 1) return "in the last hour";
  return `in the last ${intervalHours} hours`;
}

/**
 * Send everything that has been batching, if it's time. Called by
 * /api/cron/admin-digest, which runs hourly and lets THIS function decide
 * whether the configured interval has actually elapsed — keeping the schedule
 * an admin setting rather than a cron expression nobody can change without a
 * deploy.
 *
 * `force` (the "send it now" button) skips the interval check but still does
 * nothing when there is nothing pending.
 */
export async function flushDigest(
  admin: SupabaseClient,
  opts: { force?: boolean; now?: Date } = {}
): Promise<DigestResult> {
  const now = opts.now ?? new Date();
  const prefs = await readAdminNotificationPrefs(admin);

  if (!prefs.enabled || !prefs.digest.enabled) {
    return { status: "disabled", alerts: 0 };
  }

  const state = await readAlertingState(admin);
  const intervalMs = prefs.digest.intervalHours * 3_600_000;
  const lastMs = state.lastDigestAt ? Date.parse(state.lastDigestAt) : NaN;
  const dueAt = Number.isFinite(lastMs) ? lastMs + intervalMs : now.getTime();
  if (!opts.force && now.getTime() < dueAt) {
    return { status: "too_soon", alerts: 0, nextDueAt: new Date(dueAt).toISOString() };
  }

  const { data } = await admin
    .from("admin_alerts")
    .select(ALERT_COLUMNS)
    .eq("delivery", "pending")
    .order("created_at", { ascending: true })
    // A digest is a summary, not an export. Anything past this is still in the
    // inbox; capping keeps one bad night from producing an unreadable email.
    .limit(200);

  const rows = (data ?? []) as unknown as AdminAlert[];
  if (rows.length === 0) {
    // Still stamp the clock: an empty window has been "flushed", and not
    // stamping would make every later run think it's overdue.
    await writeAlertingState(admin, { lastDigestAt: now.toISOString() });
    return { status: "empty", alerts: 0 };
  }

  const recipients = resolveRecipients(prefs);
  if (recipients.length === 0 || !emailConfigured()) {
    return { status: "not_configured", alerts: rows.length };
  }

  const mail: AlertMail[] = rows.map((row) => ({
    event: row.event,
    category: (alertEvent(row.event)?.category ?? row.category) as AlertCategory,
    severity: SEVERITIES.includes(row.severity) ? row.severity : "info",
    title: row.title,
    summary: row.summary,
    context: row.context,
    link: row.link,
    repeatCount: row.repeat_count,
  }));

  const sent = await sendDigestEmail(recipients, mail, digestWindowLabel(prefs.digest.intervalHours));
  if (!sent) {
    // Rows stay `pending`, so the next run retries them instead of losing them.
    return { status: "send_failed", alerts: rows.length };
  }

  const stamp = now.toISOString();
  await admin
    .from("admin_alerts")
    .update({ delivery: "digested", emailed_at: stamp, recipients })
    .in(
      "id",
      rows.map((r) => r.id)
    );
  await writeAlertingState(admin, { lastDigestAt: stamp });

  return { status: "sent", alerts: rows.length };
}
