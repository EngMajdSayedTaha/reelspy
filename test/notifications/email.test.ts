import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/email/send", () => ({
  emailConfigured: vi.fn(() => true),
  sendEmail: vi.fn(async () => true),
}));

import { sendEmail } from "@/lib/email/send";
import { sendAlertEmail, sendDigestEmail, type AlertMail } from "@/lib/notifications/email";

const alert = (over: Partial<AlertMail> = {}): AlertMail => ({
  event: "billing.dispute_opened",
  category: "revenue",
  severity: "critical",
  title: "Chargeback opened on a $29 charge",
  summary: "Stripe needs evidence within 7 days.",
  context: { Amount: "$29.00", Reason: "fraudulent" },
  link: "/admin/billing",
  ...over,
});

const lastSend = () => vi.mocked(sendEmail).mock.calls.at(-1)![0];

beforeEach(() => {
  vi.mocked(sendEmail).mockClear().mockResolvedValue(true);
});

describe("sendAlertEmail", () => {
  it("sends one message per recipient, never a shared To: header", async () => {
    // Alerts quote customer emails and amounts; one admin shouldn't learn the
    // others' addresses from a header.
    await sendAlertEmail(["a@x.com", "b@x.com"], alert());
    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(vi.mocked(sendEmail).mock.calls.map((c) => c[0].to)).toEqual(["a@x.com", "b@x.com"]);
  });

  it("puts the severity in the subject so a lock screen is enough to triage", async () => {
    await sendAlertEmail(["a@x.com"], alert({ severity: "critical" }));
    expect(lastSend().subject).toMatch(/^\[ReelSpy ALERT\]/);

    await sendAlertEmail(["a@x.com"], alert({ severity: "warning" }));
    expect(lastSend().subject).toMatch(/^\[ReelSpy\]/);

    await sendAlertEmail(["a@x.com"], alert({ severity: "info" }));
    expect(lastSend().subject).toMatch(/^\[ReelSpy FYI\]/);
  });

  it("renders the context and an absolute link into both HTML and text", async () => {
    await sendAlertEmail(["a@x.com"], alert());
    const { html, text } = lastSend();

    expect(html).toContain("$29.00");
    expect(html).toContain("/admin/billing");
    expect(html).not.toContain('href="/admin/billing"'); // relative links don't work in mail
    expect(text).toContain("$29.00");
    expect(text).toContain("Open in admin");
  });

  it("escapes anything that came from outside", async () => {
    await sendAlertEmail(["a@x.com"], alert({ title: '<script>alert("x")</script>' }));
    expect(lastSend().html).not.toContain("<script>");
  });

  it("sends nothing when there are no recipients", async () => {
    expect(await sendAlertEmail([], alert())).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("sendDigestEmail", () => {
  it("groups the roll-up by category and counts repeats", async () => {
    await sendDigestEmail(
      ["a@x.com"],
      [
        alert({ category: "growth", severity: "info", title: "#12 joined", repeatCount: 3 }),
        alert({ category: "revenue", severity: "warning", title: "Payment failed" }),
      ],
      "in the last day"
    );

    const { html, text, subject } = lastSend();
    expect(subject).toContain("2 alerts");
    expect(html).toContain("Growth");
    expect(html).toContain("Revenue");
    expect(text).toContain("×3");
  });

  it("takes the loudest severity in the batch for the subject prefix", async () => {
    await sendDigestEmail(
      ["a@x.com"],
      [alert({ severity: "info" }), alert({ severity: "critical" })],
      "in the last hour"
    );
    expect(lastSend().subject).toMatch(/^\[ReelSpy ALERT\]/);
  });

  it("sends nothing for an empty batch", async () => {
    expect(await sendDigestEmail(["a@x.com"], [], "in the last day")).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
