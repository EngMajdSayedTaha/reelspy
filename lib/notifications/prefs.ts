// Admin alert preferences — what gets emailed, to whom, and how loudly.
//
// State lives in ONE app_settings row (`admin_notifications`), like the
// waitlist switch, so the founder tunes every alert from /admin/notifications
// with no redeploy and no env var. Deliberately NOT a `flag:` key: those are
// hand-editable as raw JSON in the generic ops settings panel, and this shape
// has enough rules (severity ladder, per-event routing, throttles) that it
// should only ever be written through the validated endpoint.
//
// Fails OPEN-AS-DEFAULTS: any read error resolves to the catalog defaults
// rather than silence. The failure mode of guessing "off" is that the founder
// stops hearing about chargebacks and dead job queues during exactly the
// incident that broke the read — alerting must degrade towards noise, never
// towards quiet.
//
// The runtime STATE alerting keeps (when the digest last flushed) is a separate
// row on purpose — see lib/notifications/state.ts. Folding it in here would
// mean every digest flush races the admin's next Save.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ALERT_EVENTS,
  SEVERITIES,
  alertEvent,
  isAlertEventKey,
  type AlertEventDef,
  type Severity,
} from "@/lib/notifications/catalog";

export const ADMIN_NOTIFICATIONS_KEY = "admin_notifications";

/** Per-event routing override. Absent fields fall back to the catalog default. */
export type EventPrefs = {
  enabled: boolean;
  /** Batch into the periodic digest instead of emailing on each occurrence. */
  digest: boolean;
  /** Suppress repeats of the same alert for this many minutes. 0 = never. */
  throttleMinutes: number;
};

export type QuietHours = {
  enabled: boolean;
  /** Local hour the quiet window opens, 0–23. */
  startHour: number;
  /** Local hour it closes, 0–23. Wraps past midnight (22 → 7 is legal). */
  endHour: number;
  /** Minutes east of UTC for the founder's own clock (Dubai = +240). */
  utcOffsetMinutes: number;
};

export type DigestPrefs = {
  enabled: boolean;
  /** How often the digest flushes. Hourly is the finest the cron supports. */
  intervalHours: number;
};

export type AdminNotificationPrefs = {
  /** Master switch. Nothing is emailed when false — alerts are still logged. */
  enabled: boolean;
  /**
   * Where alerts go. Empty means "fall back to ADMIN_ALERT_EMAIL", which is what
   * the cookie watchdog already used before this feature existed — so an
   * untouched deployment keeps behaving exactly as it did.
   */
  recipients: string[];
  /** Alerts below this severity are logged but never emailed. */
  minSeverity: Severity;
  quietHours: QuietHours;
  digest: DigestPrefs;
  /** Sparse overrides keyed by catalog event key. Unknown keys are dropped. */
  events: Record<string, EventPrefs>;
};

export const MAX_RECIPIENTS = 5;
export const MAX_THROTTLE_MINUTES = 7 * 24 * 60;
export const DIGEST_INTERVAL_CHOICES = [1, 3, 6, 12, 24] as const;

export const ADMIN_NOTIFICATION_PREFS_DEFAULT: AdminNotificationPrefs = {
  enabled: true,
  recipients: [],
  minSeverity: "info",
  quietHours: {
    enabled: false,
    startHour: 22,
    endHour: 8,
    // Dubai — where the company is. A founder who moves changes it in the UI.
    utcOffsetMinutes: 240,
  },
  digest: { enabled: true, intervalHours: 24 },
  events: {},
};

// ── normalization ────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeRecipient(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) return null;
  return email;
}

export function normalizeRecipients(value: unknown): string[] {
  const list = Array.isArray(value) ? value : [];
  const out: string[] = [];
  for (const item of list) {
    const email = normalizeRecipient(item);
    // De-duped: two identical addresses would otherwise double every alert.
    if (email && !out.includes(email)) out.push(email);
    if (out.length >= MAX_RECIPIENTS) break;
  }
  return out;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function normalizeEventPrefs(value: unknown, def: AlertEventDef): EventPrefs {
  const v = (value ?? {}) as Record<string, unknown>;
  return {
    enabled: typeof v.enabled === "boolean" ? v.enabled : def.defaultEnabled,
    digest: typeof v.digest === "boolean" ? v.digest : def.defaultDigest,
    throttleMinutes:
      v.throttleMinutes === undefined
        ? def.defaultThrottleMinutes
        : clampInt(v.throttleMinutes, 0, MAX_THROTTLE_MINUTES, def.defaultThrottleMinutes),
  };
}

/**
 * Tolerant of anything sitting in the row: the value is jsonb, it survives
 * across deploys that add and remove catalog events, and a half-written shape
 * must never throw inside a `notifyAdmins` call on a hot path.
 */
export function normalizeAdminNotificationPrefs(value: unknown): AdminNotificationPrefs {
  const v = (value ?? {}) as Record<string, unknown>;
  const q = (v.quietHours ?? {}) as Record<string, unknown>;
  const d = (v.digest ?? {}) as Record<string, unknown>;
  const rawEvents = (v.events ?? {}) as Record<string, unknown>;

  const events: Record<string, EventPrefs> = {};
  for (const [key, raw] of Object.entries(rawEvents)) {
    // Keys that left the catalog are dropped rather than carried forever.
    const def = alertEvent(key);
    if (!def) continue;
    events[key] = normalizeEventPrefs(raw, def);
  }

  const severity = SEVERITIES.includes(v.minSeverity as Severity)
    ? (v.minSeverity as Severity)
    : ADMIN_NOTIFICATION_PREFS_DEFAULT.minSeverity;

  const interval = clampInt(
    d.intervalHours,
    1,
    24,
    ADMIN_NOTIFICATION_PREFS_DEFAULT.digest.intervalHours
  );

  return {
    // Master switch defaults ON: an absent row must still alert (see the header).
    enabled: v.enabled !== false,
    recipients: normalizeRecipients(v.recipients),
    minSeverity: severity,
    quietHours: {
      enabled: q.enabled === true,
      startHour: clampInt(q.startHour, 0, 23, ADMIN_NOTIFICATION_PREFS_DEFAULT.quietHours.startHour),
      endHour: clampInt(q.endHour, 0, 23, ADMIN_NOTIFICATION_PREFS_DEFAULT.quietHours.endHour),
      utcOffsetMinutes: clampInt(
        q.utcOffsetMinutes,
        -12 * 60,
        14 * 60,
        ADMIN_NOTIFICATION_PREFS_DEFAULT.quietHours.utcOffsetMinutes
      ),
    },
    digest: {
      enabled: d.enabled !== false,
      // Snap up to a supported choice so the UI's select always has a match.
      intervalHours:
        DIGEST_INTERVAL_CHOICES.find((h) => h >= interval) ??
        DIGEST_INTERVAL_CHOICES[DIGEST_INTERVAL_CHOICES.length - 1],
    },
    events,
  };
}

/** The catalog default merged with any stored override, for one event. */
export function effectiveEventPrefs(prefs: AdminNotificationPrefs, def: AlertEventDef): EventPrefs {
  return (
    prefs.events[def.key] ?? {
      enabled: def.defaultEnabled,
      digest: def.defaultDigest,
      throttleMinutes: def.defaultThrottleMinutes,
    }
  );
}

/** Every event with its effective settings — what the preference matrix renders. */
export function resolvedEventPrefs(prefs: AdminNotificationPrefs): (AlertEventDef & EventPrefs)[] {
  return ALERT_EVENTS.map((def) => ({ ...def, ...effectiveEventPrefs(prefs, def) }));
}

/**
 * Who actually receives mail. `ADMIN_ALERT_EMAIL` stays the fallback so a
 * deployment that never opens the settings page keeps the behaviour it had
 * before this feature shipped, and so alerting still works if the settings row
 * is wiped.
 */
export function resolveRecipients(prefs: AdminNotificationPrefs): string[] {
  if (prefs.recipients.length > 0) return prefs.recipients;
  const fallback = normalizeRecipient(process.env.ADMIN_ALERT_EMAIL);
  return fallback ? [fallback] : [];
}

/** Apply a partial patch on top of the current value, normalizing the result. */
export function nextAdminNotificationPrefs(
  current: AdminNotificationPrefs,
  patch: Partial<Omit<AdminNotificationPrefs, "events" | "quietHours" | "digest">> & {
    quietHours?: Partial<QuietHours>;
    digest?: Partial<DigestPrefs>;
    events?: Record<string, Partial<EventPrefs>>;
  }
): AdminNotificationPrefs {
  const events: Record<string, unknown> = { ...current.events };
  for (const [key, value] of Object.entries(patch.events ?? {})) {
    if (!isAlertEventKey(key)) continue;
    events[key] = { ...(current.events[key] ?? {}), ...value };
  }
  return normalizeAdminNotificationPrefs({
    ...current,
    ...patch,
    quietHours: { ...current.quietHours, ...(patch.quietHours ?? {}) },
    digest: { ...current.digest, ...(patch.digest ?? {}) },
    events,
  });
}

// ── persistence ──────────────────────────────────────────────────────────────

export async function readAdminNotificationPrefs(
  admin: SupabaseClient
): Promise<AdminNotificationPrefs> {
  try {
    const { data, error } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", ADMIN_NOTIFICATIONS_KEY)
      .maybeSingle();
    if (error || !data) return ADMIN_NOTIFICATION_PREFS_DEFAULT;
    return normalizeAdminNotificationPrefs(data.value);
  } catch {
    return ADMIN_NOTIFICATION_PREFS_DEFAULT;
  }
}

export async function writeAdminNotificationPrefs(
  admin: SupabaseClient,
  prefs: AdminNotificationPrefs
): Promise<boolean> {
  const { error } = await admin.from("app_settings").upsert(
    { key: ADMIN_NOTIFICATIONS_KEY, value: prefs, updated_at: new Date().toISOString() },
    { onConflict: "key" }
  );
  return !error;
}
