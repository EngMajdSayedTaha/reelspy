import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { memoryDb, type MemoryDb } from "@/test/helpers/memory-table";
import { ADMIN_NOTIFICATIONS_KEY } from "@/lib/notifications/prefs";

// The mailer is the only thing stubbed: everything else (routing, throttling,
// the alert row) is the real implementation running against an in-memory table.
vi.mock("@/lib/email/send", () => ({
  emailConfigured: vi.fn(() => true),
  sendEmail: vi.fn(async () => true),
}));

import { sendEmail, emailConfigured } from "@/lib/email/send";
import { notifyAdmins } from "@/lib/notifications/notify";

let db: MemoryDb;

const prefsRow = (value: Record<string, unknown>) => ({ key: ADMIN_NOTIFICATIONS_KEY, value });
const alerts = () => db.tables.admin_alerts ?? [];

beforeEach(() => {
  db = memoryDb({ admin_alerts: [] });
  process.env.ADMIN_ALERT_EMAIL = "founder@example.com";
  vi.mocked(sendEmail).mockClear().mockResolvedValue(true);
  vi.mocked(emailConfigured).mockReturnValue(true);
});

afterEach(() => {
  delete process.env.ADMIN_ALERT_EMAIL;
});

describe("notifyAdmins", () => {
  it("logs the alert and emails it", async () => {
    const result = await notifyAdmins(
      "billing.dispute_opened",
      { title: "Chargeback opened", summary: "Evidence due soon.", context: { Amount: "$29.00" } },
      { admin: db.client }
    );

    expect(result).toMatchObject({ logged: true, delivery: "emailed" });
    expect(sendEmail).toHaveBeenCalledTimes(1);

    const row = alerts()[0]!;
    expect(row).toMatchObject({
      event: "billing.dispute_opened",
      category: "revenue",
      severity: "critical",
      title: "Chargeback opened",
      delivery: "emailed",
    });
    expect(row.recipients).toEqual(["founder@example.com"]);
  });

  it("records a batched alert as pending and sends nothing yet", async () => {
    const result = await notifyAdmins(
      "waitlist.joined",
      { title: "#12 joined the waiting list" },
      { admin: db.client }
    );
    expect(result).toMatchObject({ delivery: "pending", reason: "batched" });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(alerts()[0]!.delivery).toBe("pending");
  });

  it("still LOGS an alert it was told not to email", async () => {
    // The inbox is the source of truth; email is one channel over the top. An
    // event the founder muted must still be answerable later.
    db.tables.app_settings = [prefsRow({ enabled: false })];
    const result = await notifyAdmins("job.failed", { title: "Job died" }, { admin: db.client });

    expect(result).toMatchObject({ delivery: "dropped", reason: "alerting_off" });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(alerts()).toHaveLength(1);
    expect(alerts()[0]).toMatchObject({ delivery: "dropped", delivery_reason: "alerting_off" });
  });

  it("folds a repeat inside the throttle window into the first alert", async () => {
    // job.failed throttles at 60m by catalog default.
    await notifyAdmins("job.failed", { title: "Job died", dedupeKey: "job_kind:publish" }, { admin: db.client });
    const second = await notifyAdmins(
      "job.failed",
      { title: "Job died again", dedupeKey: "job_kind:publish" },
      { admin: db.client }
    );

    expect(second).toMatchObject({ delivery: "suppressed" });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(alerts()).toHaveLength(1);
    expect(alerts()[0]!.repeat_count).toBe(2);
  });

  it("keeps different dedupe keys as separate alerts", async () => {
    await notifyAdmins("job.failed", { title: "A", dedupeKey: "job_kind:publish" }, { admin: db.client });
    await notifyAdmins("job.failed", { title: "B", dedupeKey: "job_kind:digest" }, { admin: db.client });

    expect(alerts()).toHaveLength(2);
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });

  it("never throttles an event whose window is zero", async () => {
    // Two signups a minute apart are two signups, not a repeat.
    await notifyAdmins("user.signed_up", { title: "New account: a@x.com" }, { admin: db.client });
    await notifyAdmins("user.signed_up", { title: "New account: b@x.com" }, { admin: db.client });
    expect(alerts()).toHaveLength(2);
  });

  it("marks the alert dropped when there is nowhere to send it", async () => {
    delete process.env.ADMIN_ALERT_EMAIL;
    const result = await notifyAdmins("billing.dispute_opened", { title: "Chargeback" }, { admin: db.client });

    expect(result).toMatchObject({ delivery: "dropped", reason: "no_recipients" });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(alerts()[0]!.delivery).toBe("dropped");
  });

  it("marks the alert failed — not emailed — when the provider refuses", async () => {
    vi.mocked(sendEmail).mockResolvedValue(false);
    const result = await notifyAdmins("billing.dispute_opened", { title: "Chargeback" }, { admin: db.client });

    expect(result).toMatchObject({ delivery: "failed" });
    expect(alerts()[0]).toMatchObject({ delivery: "failed", delivery_reason: "send_rejected" });
  });

  it("refuses an unknown event key without throwing or writing", async () => {
    const result = await notifyAdmins("not.a.real.event", { title: "?" }, { admin: db.client });
    expect(result).toEqual({ logged: false, delivery: "error", reason: "unknown_event" });
    expect(alerts()).toHaveLength(0);
  });

  it("drops empty context values so the email has no blank rows", async () => {
    await notifyAdmins(
      "user.deleted_account",
      { title: "Account deleted", context: { Email: "a@x.com", Plan: undefined, Note: "" } },
      { admin: db.client }
    );
    expect(alerts()[0]!.context).toEqual({ Email: "a@x.com" });
  });

  it("honours a caller's severity override", async () => {
    await notifyAdmins(
      "user.signed_up",
      { title: "VIP signed up", severity: "critical" },
      { admin: db.client }
    );
    expect(alerts()[0]!.severity).toBe("critical");
  });

  it("never rejects, even when the database is broken", async () => {
    const broken = {
      from: () => {
        throw new Error("connection refused");
      },
    } as never;
    await expect(
      notifyAdmins("job.failed", { title: "Job died" }, { admin: broken })
    ).resolves.toMatchObject({ logged: false });
  });
});
