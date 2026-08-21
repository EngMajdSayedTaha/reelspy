import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { memoryDb, type MemoryDb } from "@/test/helpers/memory-table";
import { ADMIN_NOTIFICATIONS_KEY } from "@/lib/notifications/prefs";
import { ADMIN_NOTIFICATIONS_STATE_KEY } from "@/lib/notifications/state";

vi.mock("@/lib/email/send", () => ({
  emailConfigured: vi.fn(() => true),
  sendEmail: vi.fn(async () => true),
}));

import { sendEmail, emailConfigured } from "@/lib/email/send";
import { digestWindowLabel, flushDigest, markAlertsRead, resolveAlerts } from "@/lib/notifications/alerts";

let db: MemoryDb;

const NOW = new Date("2026-08-21T12:00:00Z");

function pendingAlert(over: Record<string, unknown> = {}) {
  return {
    id: (over.id as string) ?? crypto.randomUUID(),
    event: "waitlist.joined",
    category: "growth",
    severity: "info",
    title: "#12 joined the waiting list",
    summary: null,
    context: {},
    link: "/admin/waitlist",
    repeat_count: 1,
    delivery: "pending",
    read_at: null,
    resolved_at: null,
    created_at: "2026-08-21T09:00:00Z",
    ...over,
  };
}

beforeEach(() => {
  db = memoryDb({ admin_alerts: [], app_settings: [] });
  process.env.ADMIN_ALERT_EMAIL = "founder@example.com";
  vi.mocked(sendEmail).mockClear().mockResolvedValue(true);
  vi.mocked(emailConfigured).mockReturnValue(true);
});

afterEach(() => {
  delete process.env.ADMIN_ALERT_EMAIL;
});

const state = () =>
  (db.tables.app_settings ?? []).find((r) => r.key === ADMIN_NOTIFICATIONS_STATE_KEY)?.value as
    | { lastDigestAt: string | null }
    | undefined;

describe("flushDigest", () => {
  it("sends the batched alerts and flips them to digested", async () => {
    db.tables.admin_alerts = [pendingAlert({ id: "a" }), pendingAlert({ id: "b" })];

    const result = await flushDigest(db.client, { now: NOW });

    expect(result).toEqual({ status: "sent", alerts: 2 });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(db.tables.admin_alerts!.every((r) => r.delivery === "digested")).toBe(true);
    expect(state()?.lastDigestAt).toBe(NOW.toISOString());
  });

  it("does nothing until the configured interval has elapsed", async () => {
    db.tables.app_settings = [
      { key: ADMIN_NOTIFICATIONS_KEY, value: { digest: { enabled: true, intervalHours: 24 } } },
      { key: ADMIN_NOTIFICATIONS_STATE_KEY, value: { lastDigestAt: "2026-08-21T06:00:00Z" } },
    ];
    db.tables.admin_alerts = [pendingAlert()];

    const result = await flushDigest(db.client, { now: NOW });

    expect(result.status).toBe("too_soon");
    expect(sendEmail).not.toHaveBeenCalled();
    expect(db.tables.admin_alerts![0]!.delivery).toBe("pending");
  });

  it("force sends regardless of the interval — that's the 'send now' button", async () => {
    db.tables.app_settings = [
      { key: ADMIN_NOTIFICATIONS_STATE_KEY, value: { lastDigestAt: "2026-08-21T11:59:00Z" } },
    ];
    db.tables.admin_alerts = [pendingAlert()];

    expect(await flushDigest(db.client, { now: NOW, force: true })).toEqual({
      status: "sent",
      alerts: 1,
    });
  });

  it("stamps the clock on an empty window so later runs aren't permanently overdue", async () => {
    const result = await flushDigest(db.client, { now: NOW });
    expect(result.status).toBe("empty");
    expect(sendEmail).not.toHaveBeenCalled();
    expect(state()?.lastDigestAt).toBe(NOW.toISOString());
  });

  it("leaves the alerts pending when the send fails, so nothing is lost", async () => {
    vi.mocked(sendEmail).mockResolvedValue(false);
    db.tables.admin_alerts = [pendingAlert()];

    expect(await flushDigest(db.client, { now: NOW })).toEqual({ status: "send_failed", alerts: 1 });
    expect(db.tables.admin_alerts![0]!.delivery).toBe("pending");
    expect(state()?.lastDigestAt).toBeUndefined();
  });

  it("does nothing when the digest is switched off", async () => {
    db.tables.app_settings = [
      { key: ADMIN_NOTIFICATIONS_KEY, value: { digest: { enabled: false } } },
    ];
    db.tables.admin_alerts = [pendingAlert()];

    expect((await flushDigest(db.client, { now: NOW })).status).toBe("disabled");
    expect(db.tables.admin_alerts![0]!.delivery).toBe("pending");
  });

  it("holds the alerts when there is no mailer, rather than marking them sent", async () => {
    vi.mocked(emailConfigured).mockReturnValue(false);
    db.tables.admin_alerts = [pendingAlert()];

    expect(await flushDigest(db.client, { now: NOW })).toEqual({
      status: "not_configured",
      alerts: 1,
    });
    expect(db.tables.admin_alerts![0]!.delivery).toBe("pending");
  });
});

describe("digestWindowLabel", () => {
  it("reads as English at every supported interval", () => {
    expect(digestWindowLabel(1)).toBe("in the last hour");
    expect(digestWindowLabel(6)).toBe("in the last 6 hours");
    expect(digestWindowLabel(24)).toBe("in the last day");
  });
});

describe("inbox actions", () => {
  it("marks only the unread rows read", async () => {
    db.tables.admin_alerts = [
      pendingAlert({ id: "a", read_at: null }),
      pendingAlert({ id: "b", read_at: "2026-08-20T00:00:00Z" }),
    ];
    expect(await markAlertsRead(db.client, { all: true })).toBe(1);
    expect(db.tables.admin_alerts![1]!.read_at).toBe("2026-08-20T00:00:00Z");
  });

  it("resolving is idempotent — the first admin to handle it keeps the credit", async () => {
    db.tables.admin_alerts = [pendingAlert({ id: "a" })];
    expect(await resolveAlerts(db.client, ["a"], "admin-1")).toBe(1);
    const firstStamp = db.tables.admin_alerts![0]!.resolved_at;

    expect(await resolveAlerts(db.client, ["a"], "admin-2")).toBe(0);
    expect(db.tables.admin_alerts![0]!.resolved_by).toBe("admin-1");
    expect(db.tables.admin_alerts![0]!.resolved_at).toBe(firstStamp);
  });

  it("ignores an empty id list rather than touching every row", async () => {
    db.tables.admin_alerts = [pendingAlert({ id: "a" })];
    expect(await resolveAlerts(db.client, [], "admin-1")).toBe(0);
    expect(db.tables.admin_alerts![0]!.resolved_at).toBeNull();
  });
});
