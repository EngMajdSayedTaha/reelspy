import { describe, it, expect, afterEach } from "vitest";
import {
  ADMIN_NOTIFICATIONS_KEY,
  ADMIN_NOTIFICATION_PREFS_DEFAULT,
  effectiveEventPrefs,
  nextAdminNotificationPrefs,
  normalizeAdminNotificationPrefs,
  normalizeRecipients,
  readAdminNotificationPrefs,
  resolveRecipients,
  resolvedEventPrefs,
} from "@/lib/notifications/prefs";
import { ALERT_EVENTS, alertEvent } from "@/lib/notifications/catalog";
import { memoryDb } from "@/test/helpers/memory-table";
import { throwingSupabase } from "@/test/helpers/fake-supabase";

const originalEnv = process.env.ADMIN_ALERT_EMAIL;
afterEach(() => {
  if (originalEnv === undefined) delete process.env.ADMIN_ALERT_EMAIL;
  else process.env.ADMIN_ALERT_EMAIL = originalEnv;
});

describe("normalizeAdminNotificationPrefs", () => {
  it("treats an absent row as the defaults, with alerting ON", () => {
    // Alerting degrades towards noise, never towards silence: a missing or
    // unreadable settings row must not mean "the founder hears nothing".
    expect(normalizeAdminNotificationPrefs(undefined)).toEqual(ADMIN_NOTIFICATION_PREFS_DEFAULT);
    expect(normalizeAdminNotificationPrefs(null).enabled).toBe(true);
    expect(normalizeAdminNotificationPrefs({}).enabled).toBe(true);
  });

  it("only a literal false switches alerting off", () => {
    expect(normalizeAdminNotificationPrefs({ enabled: false }).enabled).toBe(false);
    expect(normalizeAdminNotificationPrefs({ enabled: "false" }).enabled).toBe(true);
    expect(normalizeAdminNotificationPrefs({ enabled: 0 }).enabled).toBe(true);
  });

  it("falls back to a valid severity when the stored one is junk", () => {
    expect(normalizeAdminNotificationPrefs({ minSeverity: "loud" }).minSeverity).toBe("info");
    expect(normalizeAdminNotificationPrefs({ minSeverity: "critical" }).minSeverity).toBe("critical");
  });

  it("drops event keys that have left the catalog", () => {
    const prefs = normalizeAdminNotificationPrefs({
      events: { "job.failed": { enabled: false }, "retired.event": { enabled: true } },
    });
    expect(prefs.events["job.failed"]?.enabled).toBe(false);
    expect(prefs.events["retired.event"]).toBeUndefined();
  });

  it("fills a partial event override from the catalog default", () => {
    const def = alertEvent("waitlist.joined")!;
    const prefs = normalizeAdminNotificationPrefs({ events: { "waitlist.joined": { enabled: false } } });
    expect(prefs.events["waitlist.joined"]).toEqual({
      enabled: false,
      digest: def.defaultDigest,
      throttleMinutes: def.defaultThrottleMinutes,
    });
  });

  it("clamps hours, offsets and throttles into their legal ranges", () => {
    const prefs = normalizeAdminNotificationPrefs({
      quietHours: { enabled: true, startHour: 99, endHour: -4, utcOffsetMinutes: 99_999 },
      events: { "job.failed": { throttleMinutes: -30 } },
    });
    expect(prefs.quietHours.startHour).toBe(23);
    expect(prefs.quietHours.endHour).toBe(0);
    expect(prefs.quietHours.utcOffsetMinutes).toBe(840);
    expect(prefs.events["job.failed"]?.throttleMinutes).toBe(0);
  });

  it("snaps the digest interval to a choice the UI can render", () => {
    expect(normalizeAdminNotificationPrefs({ digest: { intervalHours: 2 } }).digest.intervalHours).toBe(3);
    expect(normalizeAdminNotificationPrefs({ digest: { intervalHours: 999 } }).digest.intervalHours).toBe(24);
  });
});

describe("normalizeRecipients", () => {
  it("lowercases, trims, de-dupes and caps the list", () => {
    expect(
      normalizeRecipients([" Founder@Example.com ", "founder@example.com", "ops@example.com"])
    ).toEqual(["founder@example.com", "ops@example.com"]);
    expect(normalizeRecipients(Array.from({ length: 20 }, (_, i) => `a${i}@x.com`))).toHaveLength(5);
  });

  it("drops anything that isn't an address", () => {
    expect(normalizeRecipients(["not-an-email", "", null, 42, "a@b.co"])).toEqual(["a@b.co"]);
    expect(normalizeRecipients("a@b.co")).toEqual([]);
  });
});

describe("resolveRecipients", () => {
  it("prefers the configured list", () => {
    process.env.ADMIN_ALERT_EMAIL = "env@example.com";
    const prefs = normalizeAdminNotificationPrefs({ recipients: ["ops@example.com"] });
    expect(resolveRecipients(prefs)).toEqual(["ops@example.com"]);
  });

  it("falls back to ADMIN_ALERT_EMAIL so an untouched deployment keeps alerting", () => {
    process.env.ADMIN_ALERT_EMAIL = "Env@Example.com";
    expect(resolveRecipients(ADMIN_NOTIFICATION_PREFS_DEFAULT)).toEqual(["env@example.com"]);
  });

  it("returns nothing when neither is set", () => {
    delete process.env.ADMIN_ALERT_EMAIL;
    expect(resolveRecipients(ADMIN_NOTIFICATION_PREFS_DEFAULT)).toEqual([]);
  });
});

describe("effectiveEventPrefs / resolvedEventPrefs", () => {
  it("returns the catalog default when nothing is overridden", () => {
    const def = alertEvent("billing.dispute_opened")!;
    expect(effectiveEventPrefs(ADMIN_NOTIFICATION_PREFS_DEFAULT, def)).toEqual({
      enabled: def.defaultEnabled,
      digest: def.defaultDigest,
      throttleMinutes: def.defaultThrottleMinutes,
    });
  });

  it("resolves every catalog event, so the settings matrix can't have gaps", () => {
    expect(resolvedEventPrefs(ADMIN_NOTIFICATION_PREFS_DEFAULT)).toHaveLength(ALERT_EVENTS.length);
  });
});

describe("nextAdminNotificationPrefs", () => {
  it("merges nested sections instead of replacing them", () => {
    const current = normalizeAdminNotificationPrefs({
      quietHours: { enabled: true, startHour: 22, endHour: 8, utcOffsetMinutes: 240 },
    });
    const next = nextAdminNotificationPrefs(current, { quietHours: { startHour: 23 } });
    expect(next.quietHours).toEqual({
      enabled: true,
      startHour: 23,
      endHour: 8,
      utcOffsetMinutes: 240,
    });
  });

  it("merges one event's patch without disturbing the others", () => {
    const current = normalizeAdminNotificationPrefs({
      events: { "job.failed": { enabled: true, digest: false, throttleMinutes: 60 } },
    });
    const next = nextAdminNotificationPrefs(current, {
      events: { "job.failed": { throttleMinutes: 15 }, "user.signed_up": { enabled: false } },
    });
    expect(next.events["job.failed"]).toEqual({ enabled: true, digest: false, throttleMinutes: 15 });
    expect(next.events["user.signed_up"]?.enabled).toBe(false);
  });

  it("ignores a patch for an event that isn't in the catalog", () => {
    const next = nextAdminNotificationPrefs(ADMIN_NOTIFICATION_PREFS_DEFAULT, {
      events: { "made.up": { enabled: true } },
    });
    expect(next.events["made.up"]).toBeUndefined();
  });
});

describe("readAdminNotificationPrefs", () => {
  it("reads and normalizes the stored row", async () => {
    const db = memoryDb({
      app_settings: [{ key: ADMIN_NOTIFICATIONS_KEY, value: { enabled: false, minSeverity: "warning" } }],
    });
    const prefs = await readAdminNotificationPrefs(db.client);
    expect(prefs.enabled).toBe(false);
    expect(prefs.minSeverity).toBe("warning");
  });

  it("falls back to the defaults rather than throwing when the read fails", async () => {
    const prefs = await readAdminNotificationPrefs(throwingSupabase());
    expect(prefs).toEqual(ADMIN_NOTIFICATION_PREFS_DEFAULT);
  });
});
