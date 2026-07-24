// Billing lifecycle emails (payment hardening). Composes the transactional
// emails the Stripe webhook sends across a subscription's life — welcome,
// renewal receipt, failed payment (dunning), cancellation, refund — plus an
// internal founder alert on a dispute. Server-only and FAIL-OPEN throughout:
// every function delegates to `sendEmail`, which no-ops (returns false) when
// Resend isn't configured, so a missing/broken notification can never fail the
// webhook or a billing state change. Stripe still sends its own card receipts;
// these are the app-branded, deep-linked layer on top.

import "server-only";
import { sendEmail } from "./send";
import { getSiteUrl } from "@/lib/site";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Format a Stripe minor-unit amount (e.g. 4900) + currency ("aed") as "AED 49.00".
export function formatMoney(amountMinor: number | null | undefined, currency: string | null | undefined): string {
  const major = (amountMinor ?? 0) / 100;
  const code = (currency ?? "").toUpperCase() || "AED";
  return `${code} ${major.toFixed(2)}`;
}

// Shared branded shell so every billing email reads as one system. Light layout
// (renders reliably across mail clients) with the neon-yellow CTA, matching
// lib/email/publish-failure.ts. `cta` is optional (the dispute alert has none).
function shell(params: {
  heading: string;
  bodyHtml: string;
  cta?: { href: string; label: string };
  footnote?: string;
}): string {
  const { heading, bodyHtml, cta, footnote } = params;
  const ctaHtml = cta
    ? `<a href="${cta.href}" style="display:inline-block;background:#F9E400;color:#121212;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600">${escapeHtml(cta.label)}</a>`
    : "";
  const footHtml = footnote
    ? `<p style="font-size:12px;color:#94A3B8;margin:20px 0 0">${footnote}</p>`
    : "";
  return `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0F172A;max-width:520px;margin:0 auto">
    <h2 style="font-size:18px;margin:0 0 12px">${escapeHtml(heading)}</h2>
    ${bodyHtml}
    ${ctaHtml}
    ${footHtml}
  </div>`;
}

const billingUrl = () => `${getSiteUrl()}/dashboard/billing`;

// ── Welcome / subscription confirmed (first invoice) ─────────────────────────
// Doubles as a payment confirmation: when the amount + hosted invoice are known
// it shows what was charged and links to the Stripe invoice/receipt (which has a
// downloadable PDF). Stripe also sends its own formal receipt when "Successful
// payments" emails are enabled — this is the branded onboarding companion.
export async function sendSubscriptionWelcome(params: {
  to: string;
  tierName: string;
  renewsOnLabel?: string | null;
  amountLabel?: string | null;
  invoiceUrl?: string | null;
}): Promise<boolean> {
  const { to, tierName, renewsOnLabel, amountLabel, invoiceUrl } = params;
  const heading = `You're on ReelSpy ${tierName} 🎉`;
  const paidLine = amountLabel
    ? `<p style="font-size:14px;color:#475569;margin:0 0 8px">Payment received: <strong>${escapeHtml(amountLabel)}</strong>.${
        invoiceUrl ? ` <a href="${invoiceUrl}" style="color:#0F172A;text-decoration:underline">View invoice / receipt</a>.` : ""
      }</p>`
    : "";
  const renewLine = renewsOnLabel
    ? `<p style="font-size:14px;color:#475569;margin:0 0 16px">Your plan renews on <strong>${escapeHtml(renewsOnLabel)}</strong>. Cancel or switch anytime from the billing page.</p>`
    : `<p style="font-size:14px;color:#475569;margin:0 0 16px">Manage or cancel anytime from the billing page.</p>`;
  const html = shell({
    heading,
    bodyHtml: `<p style="font-size:14px;color:#475569;margin:0 0 8px">Your subscription is active — every ${escapeHtml(tierName)} feature is unlocked.</p>${paidLine}${renewLine}`,
    cta: { href: `${getSiteUrl()}/dashboard`, label: "Open ReelSpy" },
  });
  const text = [
    heading,
    "",
    `Your ${tierName} subscription is active — every feature is unlocked.`,
    amountLabel ? `Payment received: ${amountLabel}.` : "",
    invoiceUrl ? `Invoice / receipt: ${invoiceUrl}` : "",
    renewsOnLabel ? `Renews on ${renewsOnLabel}.` : "",
    `Manage anytime: ${billingUrl()}`,
  ]
    .filter(Boolean)
    .join("\n");
  return sendEmail({ to, subject: `Welcome to ReelSpy ${tierName}`, html, text });
}

// ── Renewal receipt (subscription_cycle invoices) ────────────────────────────
export async function sendPaymentReceipt(params: {
  to: string;
  tierName: string;
  amountLabel: string;
  invoiceUrl?: string | null;
  renewsOnLabel?: string | null;
}): Promise<boolean> {
  const { to, tierName, amountLabel, invoiceUrl, renewsOnLabel } = params;
  const heading = `Payment received — thank you`;
  const renewLine = renewsOnLabel
    ? `<p style="font-size:14px;color:#475569;margin:0 0 16px">Next renewal: <strong>${escapeHtml(renewsOnLabel)}</strong>.</p>`
    : "";
  const html = shell({
    heading,
    bodyHtml: `<p style="font-size:14px;color:#475569;margin:0 0 8px">We charged <strong>${escapeHtml(amountLabel)}</strong> for your ReelSpy <strong>${escapeHtml(tierName)}</strong> plan.</p>${renewLine}`,
    cta: invoiceUrl
      ? { href: invoiceUrl, label: "View invoice" }
      : { href: billingUrl(), label: "View billing" },
    footnote: "This is a receipt for your records — no action is needed.",
  });
  const text = [
    heading,
    "",
    `Charged ${amountLabel} for your ReelSpy ${tierName} plan.`,
    renewsOnLabel ? `Next renewal: ${renewsOnLabel}.` : "",
    invoiceUrl ? `Invoice: ${invoiceUrl}` : `Billing: ${billingUrl()}`,
  ]
    .filter(Boolean)
    .join("\n");
  return sendEmail({ to, subject: `Your ReelSpy receipt — ${amountLabel}`, html, text });
}

// ── Payment failed / dunning ─────────────────────────────────────────────────
export async function sendPaymentFailed(params: {
  to: string;
  tierName: string;
}): Promise<boolean> {
  const { to, tierName } = params;
  const heading = `Your payment didn't go through`;
  const html = shell({
    heading,
    bodyHtml: `<p style="font-size:14px;color:#475569;margin:0 0 16px">We couldn't charge your card for the ReelSpy <strong>${escapeHtml(tierName)}</strong> plan. Stripe will retry automatically, but updating your payment method now avoids any interruption to your subscription.</p>`,
    cta: { href: billingUrl(), label: "Update payment method" },
    footnote: "If your card keeps failing, your plan will pause and you'll drop to the Free tier.",
  });
  const text = [
    heading,
    "",
    `We couldn't charge your card for the ReelSpy ${tierName} plan.`,
    `Update your payment method: ${billingUrl()}`,
  ].join("\n");
  return sendEmail({ to, subject: `Action needed — ReelSpy payment failed`, html, text });
}

// ── Subscription cancelled ───────────────────────────────────────────────────
export async function sendSubscriptionCancelled(params: {
  to: string;
  tierName: string;
  accessUntilLabel?: string | null;
}): Promise<boolean> {
  const { to, tierName, accessUntilLabel } = params;
  const heading = `Your ReelSpy ${tierName} plan is cancelled`;
  const accessLine = accessUntilLabel
    ? `<p style="font-size:14px;color:#475569;margin:0 0 16px">You keep ${escapeHtml(tierName)} access until <strong>${escapeHtml(accessUntilLabel)}</strong>, then you'll move to the Free plan.</p>`
    : `<p style="font-size:14px;color:#475569;margin:0 0 16px">You've been moved to the Free plan.</p>`;
  const html = shell({
    heading,
    bodyHtml: `<p style="font-size:14px;color:#475569;margin:0 0 8px">Your subscription has been cancelled.</p>${accessLine}`,
    cta: { href: billingUrl(), label: "Resubscribe" },
    footnote: "Changed your mind? You can resubscribe anytime and pick up where you left off.",
  });
  const text = [
    heading,
    "",
    "Your subscription has been cancelled.",
    accessUntilLabel ? `Access continues until ${accessUntilLabel}.` : "You've moved to the Free plan.",
    `Resubscribe: ${billingUrl()}`,
  ].join("\n");
  return sendEmail({ to, subject: `Your ReelSpy subscription is cancelled`, html, text });
}

// ── Refund issued ────────────────────────────────────────────────────────────
// Money-only by design: if the refund also cancelled the plan, the customer gets
// a separate cancellation email (fired by the subscription.deleted event), so
// this one never has to speak to access state.
export async function sendRefundIssued(params: {
  to: string;
  amountLabel: string;
}): Promise<boolean> {
  const { to, amountLabel } = params;
  const heading = `Your refund is on its way`;
  const html = shell({
    heading,
    bodyHtml: `<p style="font-size:14px;color:#475569;margin:0 0 16px">We've refunded <strong>${escapeHtml(amountLabel)}</strong> to your original payment method. Depending on your bank it can take 5–10 business days to appear.</p>`,
    cta: { href: billingUrl(), label: "View billing" },
  });
  const text = [
    heading,
    "",
    `We've refunded ${amountLabel} to your original payment method (5–10 business days).`,
    `Billing: ${billingUrl()}`,
  ].join("\n");
  return sendEmail({ to, subject: `Your ReelSpy refund — ${amountLabel}`, html, text });
}

// ── Internal: dispute / chargeback alert to the founder ──────────────────────
// Goes to BILLING_ALERT_EMAIL (falls back to EMAIL_FROM), NOT the customer — a
// dispute needs a human to respond in the Stripe dashboard within the deadline.
export async function sendDisputeAlert(params: {
  chargeId: string;
  amountLabel: string;
  reason?: string | null;
  customerEmail?: string | null;
}): Promise<boolean> {
  const to = (process.env.BILLING_ALERT_EMAIL || process.env.EMAIL_FROM || "").trim();
  if (!to) return false;
  const { chargeId, amountLabel, reason, customerEmail } = params;
  const heading = `⚠️ New Stripe dispute — ${amountLabel}`;
  const html = shell({
    heading,
    bodyHtml: `<p style="font-size:14px;color:#475569;margin:0 0 8px">A customer opened a dispute.</p>
      <ul style="font-size:14px;color:#0F172A;padding-left:18px;margin:0 0 16px">
        <li>Charge: <strong>${escapeHtml(chargeId)}</strong></li>
        <li>Amount: <strong>${escapeHtml(amountLabel)}</strong></li>
        ${reason ? `<li>Reason: ${escapeHtml(reason)}</li>` : ""}
        ${customerEmail ? `<li>Customer: ${escapeHtml(customerEmail)}</li>` : ""}
      </ul>`,
    cta: { href: "https://dashboard.stripe.com/disputes", label: "Respond in Stripe" },
    footnote: "Respond before Stripe's evidence deadline or the dispute is lost by default.",
  });
  const text = [
    heading,
    "",
    `Charge: ${chargeId}`,
    `Amount: ${amountLabel}`,
    reason ? `Reason: ${reason}` : "",
    customerEmail ? `Customer: ${customerEmail}` : "",
    "Respond: https://dashboard.stripe.com/disputes",
  ]
    .filter(Boolean)
    .join("\n");
  return sendEmail({ to, subject: `⚠️ Stripe dispute opened — ${amountLabel}`, html, text });
}
