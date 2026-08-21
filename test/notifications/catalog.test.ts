import { describe, it, expect } from "vitest";
import {
  ALERT_CATEGORIES,
  ALERT_EVENTS,
  ALERT_EVENT_KEYS,
  CATEGORY_HINTS,
  CATEGORY_LABELS,
  SEVERITIES,
  alertEvent,
  eventsByCategory,
  isAlertEventKey,
  severityRank,
} from "@/lib/notifications/catalog";

// The catalog is the contract three surfaces share (dispatcher, settings API,
// admin UI). These are the invariants each of them assumes without checking.
describe("alert catalog", () => {
  it("has unique keys", () => {
    expect(new Set(ALERT_EVENT_KEYS).size).toBe(ALERT_EVENT_KEYS.length);
  });

  it("only uses declared categories and severities", () => {
    for (const event of ALERT_EVENTS) {
      expect(ALERT_CATEGORIES).toContain(event.category);
      expect(SEVERITIES).toContain(event.severity);
    }
  });

  it("labels and hints every category the events use", () => {
    for (const category of ALERT_CATEGORIES) {
      expect(CATEGORY_LABELS[category]).toBeTruthy();
      expect(CATEGORY_HINTS[category]).toBeTruthy();
    }
  });

  it("gives every event a description an operator can act on", () => {
    for (const event of ALERT_EVENTS) {
      expect(event.label.length).toBeGreaterThan(3);
      expect(event.description.length).toBeGreaterThan(20);
      expect(event.defaultThrottleMinutes).toBeGreaterThanOrEqual(0);
    }
  });

  it("never batches a critical event into the digest by default", () => {
    // A digest can be up to 24h late. Anything worth waking someone for must
    // default to an immediate send, whatever the founder later chooses.
    for (const event of ALERT_EVENTS.filter((e) => e.severity === "critical")) {
      expect(event.defaultDigest).toBe(false);
    }
  });

  it("looks events up by key and rejects everything else", () => {
    expect(alertEvent("waitlist.joined")?.category).toBe("growth");
    expect(alertEvent("nope.nope")).toBeNull();
    expect(isAlertEventKey("job.failed")).toBe(true);
    expect(isAlertEventKey("job.failed ")).toBe(false);
  });

  it("groups every event into exactly one rendered category", () => {
    const grouped = eventsByCategory().flatMap((g) => g.events);
    expect(grouped).toHaveLength(ALERT_EVENTS.length);
  });

  it("ranks severities weakest to strongest", () => {
    expect(severityRank("info")).toBeLessThan(severityRank("warning"));
    expect(severityRank("warning")).toBeLessThan(severityRank("critical"));
  });
});
