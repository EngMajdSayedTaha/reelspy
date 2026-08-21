import { describe, it, expect } from "vitest";
import { inQuietHours, routeAlert } from "@/lib/notifications/routing";
import { normalizeAdminNotificationPrefs } from "@/lib/notifications/prefs";
import { alertEvent, type AlertEventDef } from "@/lib/notifications/catalog";

const prefs = (patch: Record<string, unknown> = {}) => normalizeAdminNotificationPrefs(patch);

// A synthetic event, so these tests describe the RULES rather than whatever the
// catalog currently defaults a real event to.
const def = (over: Partial<AlertEventDef> = {}): AlertEventDef => ({
  key: "job.failed",
  category: "reliability",
  label: "Test event",
  description: "x",
  severity: "warning",
  defaultEnabled: true,
  defaultDigest: false,
  defaultThrottleMinutes: 0,
  ...over,
});

// 2026-08-21T02:00:00Z = 06:00 in UTC+4.
const NIGHT_UTC = new Date("2026-08-21T02:00:00Z");
// 2026-08-21T10:00:00Z = 14:00 in UTC+4.
const DAY_UTC = new Date("2026-08-21T10:00:00Z");

describe("inQuietHours", () => {
  const quiet = (over: Record<string, unknown> = {}) =>
    prefs({ quietHours: { enabled: true, startHour: 22, endHour: 8, utcOffsetMinutes: 240, ...over } });

  it("is never quiet when the window is switched off", () => {
    expect(inQuietHours(prefs({ quietHours: { enabled: false } }), NIGHT_UTC)).toBe(false);
  });

  it("wraps past midnight", () => {
    expect(inQuietHours(quiet(), NIGHT_UTC)).toBe(true); // 06:00 local
    expect(inQuietHours(quiet(), DAY_UTC)).toBe(false); // 14:00 local
  });

  it("handles a same-day window too", () => {
    const p = quiet({ startHour: 12, endHour: 16 });
    expect(inQuietHours(p, DAY_UTC)).toBe(true);
    expect(inQuietHours(p, NIGHT_UTC)).toBe(false);
  });

  it("evaluates in the founder's offset, not UTC", () => {
    // Same instant, opposite side of the planet: 02:00Z is 21:00 the previous
    // day at UTC-5, which is outside a 22:00–08:00 window.
    expect(inQuietHours(quiet({ utcOffsetMinutes: -300 }), NIGHT_UTC)).toBe(false);
  });

  it("treats a zero-length window as never quiet, not as always quiet", () => {
    // Mistyping one number must not silence alerting for a whole day.
    expect(inQuietHours(quiet({ startHour: 9, endHour: 9 }), DAY_UTC)).toBe(false);
  });
});

describe("routeAlert", () => {
  it("drops everything when the master switch is off", () => {
    expect(routeAlert(prefs({ enabled: false }), def(), DAY_UTC)).toEqual({
      action: "drop",
      reason: "alerting_off",
    });
  });

  it("drops an event the founder switched off", () => {
    const p = prefs({ events: { "job.failed": { enabled: false } } });
    expect(routeAlert(p, def(), DAY_UTC).action).toBe("drop");
  });

  it("drops anything under the severity floor", () => {
    const p = prefs({ minSeverity: "critical" });
    expect(routeAlert(p, def({ severity: "warning" }), DAY_UTC).reason).toBe(
      "below_min_severity:critical"
    );
    expect(routeAlert(p, def({ severity: "critical" }), DAY_UTC).action).toBe("email");
  });

  it("batches an event routed to the digest", () => {
    const p = prefs({ events: { "job.failed": { digest: true } } });
    expect(routeAlert(p, def(), DAY_UTC)).toEqual({ action: "digest", reason: "batched" });
  });

  it("emails a digest-routed event immediately when the digest is off", () => {
    // Switching the digest off must never turn batched alerts into silence.
    const p = prefs({ digest: { enabled: false }, events: { "job.failed": { digest: true } } });
    expect(routeAlert(p, def(), DAY_UTC).action).toBe("email");
  });

  it("holds a non-urgent alert during quiet hours", () => {
    const p = prefs({ quietHours: { enabled: true, startHour: 22, endHour: 8, utcOffsetMinutes: 240 } });
    expect(routeAlert(p, def({ severity: "warning" }), NIGHT_UTC)).toEqual({
      action: "digest",
      reason: "quiet_hours",
    });
  });

  it("lets a critical alert through quiet hours", () => {
    const p = prefs({ quietHours: { enabled: true, startHour: 22, endHour: 8, utcOffsetMinutes: 240 } });
    expect(routeAlert(p, def({ severity: "critical" }), NIGHT_UTC).action).toBe("email");
  });

  it("still emails during quiet hours when there is no digest to hold it in", () => {
    const p = prefs({
      digest: { enabled: false },
      quietHours: { enabled: true, startHour: 22, endHour: 8, utcOffsetMinutes: 240 },
    });
    expect(routeAlert(p, def(), NIGHT_UTC)).toEqual({
      action: "email",
      reason: "quiet_hours_no_digest",
    });
  });

  it("emails a real catalog event with untouched defaults", () => {
    expect(routeAlert(prefs(), alertEvent("billing.dispute_opened")!, DAY_UTC)).toEqual({
      action: "email",
      reason: "immediate",
    });
  });
});
