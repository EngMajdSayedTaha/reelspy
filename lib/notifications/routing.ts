// The routing decision: given the preferences and an event, does this alert go
// out now, wait for the digest, or get logged and left alone?
//
// Pure and synchronous on purpose — this is the part of alerting with actual
// rules in it (master switch, per-event enable, severity floor, quiet hours,
// digest batching), so it is unit-testable without a database, an SMTP double,
// or a clock. The dispatcher owns everything that needs I/O: throttle lookups,
// the alert row, the send itself.
//
// Every path returns a REASON string. It is written to the alert row, so
// "why didn't I get an email about this?" is answerable from the admin UI
// months later instead of by reading this file.

import { severityRank, type AlertEventDef } from "@/lib/notifications/catalog";
import {
  effectiveEventPrefs,
  type AdminNotificationPrefs,
} from "@/lib/notifications/prefs";

export type DeliveryAction = "email" | "digest" | "drop";

export type DeliveryDecision = {
  action: DeliveryAction;
  /** Short machine-ish reason, stored on the alert row. */
  reason: string;
};

/**
 * True when `at` falls inside the configured quiet window, evaluated in the
 * founder's own offset rather than UTC — "no pings between 22:00 and 08:00"
 * means their night, not Greenwich's.
 *
 * The window wraps midnight when start > end, which is the normal case. A
 * window whose start equals its end is treated as EMPTY (never quiet) rather
 * than as all day: silencing alerting for 24h by mistyping one number is a much
 * worse failure than the reverse.
 */
export function inQuietHours(prefs: AdminNotificationPrefs, at: Date): boolean {
  const q = prefs.quietHours;
  if (!q.enabled || q.startHour === q.endHour) return false;
  const localMinutes = at.getTime() / 60_000 + q.utcOffsetMinutes;
  // Modulo twice: JS % keeps the sign, and a negative offset can push a UTC
  // timestamp before its own local midnight.
  const hour = Math.floor((((localMinutes % 1440) + 1440) % 1440) / 60);
  return q.startHour < q.endHour
    ? hour >= q.startHour && hour < q.endHour
    : hour >= q.startHour || hour < q.endHour;
}

/**
 * Decide where one occurrence goes.
 *
 * The severity floor and quiet hours behave differently on purpose:
 *
 *   * Below the severity floor → DROP. The founder said they don't want to know.
 *   * Inside quiet hours → DIGEST. They said "not now", not "not ever", so the
 *     alert is held and arrives in the next digest.
 *   * `critical` ignores quiet hours entirely. A chargeback or a dead cron at
 *     3am is exactly the thing worth waking up for; a quiet-hours setting that
 *     swallowed those would make the whole feature untrustworthy.
 *
 * When the digest itself is switched off, anything that would have been batched
 * is emailed immediately instead of vanishing — silence is never the fallback.
 */
export function routeAlert(
  prefs: AdminNotificationPrefs,
  def: AlertEventDef,
  at: Date = new Date()
): DeliveryDecision {
  if (!prefs.enabled) return { action: "drop", reason: "alerting_off" };

  const event = effectiveEventPrefs(prefs, def);
  if (!event.enabled) return { action: "drop", reason: "event_off" };

  if (severityRank(def.severity) < severityRank(prefs.minSeverity)) {
    return { action: "drop", reason: `below_min_severity:${prefs.minSeverity}` };
  }

  const wantsDigest = event.digest && prefs.digest.enabled;
  if (wantsDigest) return { action: "digest", reason: "batched" };

  if (def.severity !== "critical" && inQuietHours(prefs, at)) {
    return prefs.digest.enabled
      ? { action: "digest", reason: "quiet_hours" }
      : { action: "email", reason: "quiet_hours_no_digest" };
  }

  return { action: "email", reason: "immediate" };
}
