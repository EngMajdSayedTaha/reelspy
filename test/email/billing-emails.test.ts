import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  formatMoney,
  planHighlights,
  sendPlanChangeScheduled,
  sendCancellationScheduled,
  sendPaymentReceipt,
  sendSubscriptionWelcome,
} from "@/lib/email/billing";

// These assert the PROMISES the billing emails make, not their prose. The
// deferred-change policy only holds up if the customer's written record says the
// same thing the UI does: nothing charged today, the old plan runs to its date,
// the change can still be called off.

type Sent = { to: string; subject: string; html: string; text: string };

let sent: Sent[];

beforeEach(() => {
  sent = [];
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("EMAIL_FROM", "ReelSpy <billing@reelspy.dev>");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://app.reelspy.dev");
  vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
    sent.push(JSON.parse(init.body) as Sent);
    return { ok: true, text: async () => "" } as unknown as Response;
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("sendPlanChangeScheduled", () => {
  it("states that nothing is charged today and when the new plan starts", async () => {
    const ok = await sendPlanChangeScheduled({
      to: "user@example.com",
      currentTierName: "Creator",
      nextTier: "pro",
      nextTierName: "Pro",
      effectiveOnLabel: "Aug 29, 2026",
      nextPriceLabel: "AED 149",
      direction: "upgrade",
    });

    expect(ok).toBe(true);
    const email = sent[0];
    expect(email.to).toBe("user@example.com");
    expect(email.subject).toContain("Aug 29, 2026");
    expect(email.html).toContain("Charged today");
    expect(email.html).toContain("Nothing");
    expect(email.html).toContain("Aug 29, 2026");
    // The way out has to be in the email, not just the UI.
    expect(email.text).toContain("cancel this scheduled change");
    // Branded like every other email.
    expect(email.html).toContain("/brand/reelspy-logo-512.png");
  });

  it("lists what the new plan will actually grant", async () => {
    await sendPlanChangeScheduled({
      to: "user@example.com",
      currentTierName: "Pro",
      nextTier: "creator",
      nextTierName: "Creator",
      effectiveOnLabel: "Sep 1, 2026",
      nextPriceLabel: "AED 49",
      direction: "downgrade",
    });
    expect(sent[0].text).toContain("30 tracked competitor accounts");
    expect(sent[0].text).toContain("60 AI scripts per month");
  });
});

describe("sendCancellationScheduled", () => {
  it("promises access to the end of the paid period and no further charges", async () => {
    await sendCancellationScheduled({
      to: "user@example.com",
      tierName: "Studio",
      accessUntilLabel: "Aug 29, 2026",
    });
    const email = sent[0];
    expect(email.subject).toContain("Aug 29, 2026");
    expect(email.html).toContain("Access until");
    expect(email.html).toContain("Future charges");
    expect(email.text).toContain("None");
    expect(email.text).toContain("Free plan");
  });
});

describe("receipts and welcome", () => {
  it("puts the amount in the receipt subject and the invoice link in the body", async () => {
    await sendPaymentReceipt({
      to: "user@example.com",
      tierName: "Pro",
      amountLabel: "AED 149.00",
      invoiceUrl: "https://invoice.stripe.com/abc",
      invoiceNumber: "RS-0001",
      renewsOnLabel: "Sep 29, 2026",
    });
    const email = sent[0];
    expect(email.subject).toBe("Your ReelSpy receipt — AED 149.00");
    expect(email.html).toContain("https://invoice.stripe.com/abc");
    expect(email.html).toContain("RS-0001");
  });

  it("tells a new subscriber the end-of-period rule up front", async () => {
    await sendSubscriptionWelcome({
      to: "user@example.com",
      tierName: "Creator",
      tier: "creator",
      renewsOnLabel: "Aug 29, 2026",
      amountLabel: "AED 49.00",
      invoiceUrl: null,
    });
    expect(sent[0].text).toContain("the change starts at your next renewal date");
  });
});

describe("fail-open", () => {
  it("returns false and sends nothing when Resend isn't configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const ok = await sendCancellationScheduled({ to: "user@example.com", tierName: "Pro" });
    expect(ok).toBe(false);
    expect(sent).toHaveLength(0);
  });
});

describe("helpers", () => {
  it("formats Stripe minor units with the currency code", () => {
    expect(formatMoney(4900, "aed")).toBe("AED 49.00");
    expect(formatMoney(0, null)).toBe("AED 0.00");
    expect(formatMoney(null, "usd")).toBe("USD 0.00");
  });

  it("derives plan highlights from the enforced entitlements, not from copy", () => {
    expect(planHighlights("studio")).toContain("Unlimited AI scripts per month");
    expect(planHighlights("free")).not.toContain("Publishing to 0 connected channels");
    expect(
      planHighlights("custom", {
        accounts: 42,
        scripts_mo: 99,
        transcripts_mo: 50,
        automations: 7,
        publish_targets: 2,
        ig_connections: 1,
        model: "opus",
      })
    ).toContain("42 tracked competitor accounts");
  });
});
