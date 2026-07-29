// Billing lifecycle emails. Every money- or plan-related message a customer can
// receive is composed here, on the shared branded template (lib/email/layout.ts),
// so the whole subscription lifecycle reads as one voice:
//
//   subscription started        → sendSubscriptionWelcome
//   renewal charged             → sendPaymentReceipt
//   renewal coming up           → sendRenewalReminder
//   card declined               → sendPaymentFailed
//   plan change booked          → sendPlanChangeScheduled   (upgrade or downgrade)
//   plan change went live       → sendPlanChangeApplied
//   plan change called off      → sendPlanChangeCancelled
//   cancellation booked         → sendCancellationScheduled
//   cancellation called off     → sendSubscriptionResumed
//   subscription ended          → sendSubscriptionCancelled
//   money returned              → sendRefundIssued
//   chargeback (internal)       → sendDisputeAlert
//
// Server-only and FAIL-OPEN throughout: every function delegates to `sendEmail`,
// which no-ops (returns false) when Resend isn't configured, so a missing or
// broken notification can never fail the webhook or a billing state change.
// Stripe still sends its own card receipts; these are the app-branded,
// deep-linked layer on top.

import "server-only";
import { sendEmail } from "./send";
import { buildEmail, type EmailBlock } from "./layout";
import { getSiteUrl } from "@/lib/site";
import type { AiTier } from "@/lib/ai/tier";
import { entitlementsFor, formatLimit, type Entitlements } from "@/lib/billing/entitlements";

// Format a Stripe minor-unit amount (e.g. 4900) + currency ("aed") as "AED 49.00".
export function formatMoney(amountMinor: number | null | undefined, currency: string | null | undefined): string {
  const major = (amountMinor ?? 0) / 100;
  const code = (currency ?? "").toUpperCase() || "AED";
  return `${code} ${major.toFixed(2)}`;
}

const billingUrl = () => `${getSiteUrl()}/dashboard/billing`;

const MODEL_LABELS: Record<Entitlements["model"], string> = {
  haiku: "Claude Haiku",
  sonnet: "Claude Sonnet",
  opus: "Claude Opus",
};

// What a plan actually gives you, spelled out. Used wherever an email tells the
// customer what they're getting (or losing) so the numbers always come from the
// same entitlements table the product enforces — never from hand-written copy.
export function planHighlights(tier: AiTier, custom?: Entitlements | null): string[] {
  const ent = custom ?? entitlementsFor(tier);
  return [
    `${formatLimit(ent.accounts)} tracked competitor accounts`,
    `${formatLimit(ent.scripts_mo)} AI scripts per month`,
    `${formatLimit(ent.transcripts_mo)} reel transcripts per month`,
    `${formatLimit(ent.automations)} comment auto-replies`,
    `${MODEL_LABELS[ent.model]} powering your scripts`,
    ...(ent.publish_targets > 0
      ? [`Publishing to ${formatLimit(ent.publish_targets)} connected channel${ent.publish_targets === 1 ? "" : "s"}`]
      : []),
  ];
}

const PLAN_REASON = "You're receiving this because you have a paid ReelSpy subscription.";

// ── Welcome / subscription confirmed (first invoice) ─────────────────────────
// Doubles as a payment confirmation: when the amount + hosted invoice are known
// it shows what was charged and links to the Stripe invoice/receipt (which has a
// downloadable PDF).
export async function sendSubscriptionWelcome(params: {
  to: string;
  tierName: string;
  tier?: AiTier;
  entitlements?: Entitlements | null;
  renewsOnLabel?: string | null;
  amountLabel?: string | null;
  invoiceUrl?: string | null;
}): Promise<boolean> {
  const { to, tierName, tier, entitlements, renewsOnLabel, amountLabel, invoiceUrl } = params;

  const blocks: EmailBlock[] = [
    {
      kind: "paragraph",
      text: `Your subscription is active and every ${tierName} feature is unlocked — you can start tracking accounts and generating scripts right now.`,
    },
    {
      kind: "rows",
      caption: "Subscription summary",
      rows: [
        { label: "Plan", value: `ReelSpy ${tierName}`, emphasis: true },
        ...(amountLabel ? [{ label: "Paid today", value: amountLabel }] : []),
        ...(renewsOnLabel ? [{ label: "Next renewal", value: renewsOnLabel }] : []),
        { label: "Billing cycle", value: "Monthly" },
      ],
    },
  ];

  if (tier) {
    blocks.push({ kind: "bullets", caption: "What's included", items: planHighlights(tier, entitlements) });
  }

  blocks.push({
    kind: "callout",
    text:
      "Good to know: moving up a plan takes effect immediately and you're only charged the prorated difference for the rest of your billing period. Moving down takes effect at your next renewal, so you always keep the plan you've already paid for.",
  });

  const { html, text } = buildEmail({
    eyebrow: "Billing",
    preheader: `Your ReelSpy ${tierName} subscription is active${renewsOnLabel ? ` and renews on ${renewsOnLabel}` : ""}.`,
    title: `Welcome to ReelSpy ${tierName}`,
    blocks,
    cta: { href: `${getSiteUrl()}/dashboard`, label: "Open ReelSpy" },
    ...(invoiceUrl ? { secondary: { href: invoiceUrl, label: "View invoice / receipt (PDF)" } } : {}),
    footnote: "Manage your plan, payment method and invoices any time from the billing page.",
    reason: PLAN_REASON,
  });

  return sendEmail({ to, subject: `Welcome to ReelSpy ${tierName} — your subscription is active`, html, text });
}

// ── Renewal receipt (subscription_cycle invoices) ────────────────────────────
export async function sendPaymentReceipt(params: {
  to: string;
  tierName: string;
  amountLabel: string;
  invoiceUrl?: string | null;
  invoiceNumber?: string | null;
  paidOnLabel?: string | null;
  renewsOnLabel?: string | null;
  /** "proration" = the mid-period difference charged when a plan was upgraded. */
  kind?: "renewal" | "proration";
}): Promise<boolean> {
  const { to, tierName, amountLabel, invoiceUrl, invoiceNumber, paidOnLabel, renewsOnLabel, kind } = params;
  const proration = kind === "proration";

  const { html, text } = buildEmail({
    eyebrow: "Receipt",
    preheader: `Payment of ${amountLabel} received for your ReelSpy ${tierName} plan.`,
    title: "Payment received — thank you",
    blocks: [
      {
        kind: "paragraph",
        text: proration
          ? `We've charged your payment method for your move to ReelSpy ${tierName}. This covers only the rest of your current billing period, with credit for the time you'd already paid for on your previous plan.`
          : `We've charged your payment method for another month of ReelSpy ${tierName}. Nothing is needed from you — this email is just your receipt.`,
      },
      {
        kind: "rows",
        caption: "Receipt",
        rows: [
          { label: "Plan", value: `ReelSpy ${tierName}` },
          {
            label: proration ? "Charged (prorated)" : "Amount charged",
            value: amountLabel,
            emphasis: true,
          },
          ...(paidOnLabel ? [{ label: "Charged on", value: paidOnLabel }] : []),
          ...(invoiceNumber ? [{ label: "Invoice", value: invoiceNumber }] : []),
          ...(renewsOnLabel ? [{ label: "Next renewal", value: renewsOnLabel }] : []),
        ],
      },
    ],
    cta: invoiceUrl ? { href: invoiceUrl, label: "View invoice" } : { href: billingUrl(), label: "View billing" },
    ...(invoiceUrl ? { secondary: { href: billingUrl(), label: "Manage your plan" } } : {}),
    footnote: "This is a receipt for your records — no action is needed.",
    reason: PLAN_REASON,
  });

  return sendEmail({ to, subject: `Your ReelSpy receipt — ${amountLabel}`, html, text });
}

// ── Renewal reminder (invoice.upcoming) ──────────────────────────────────────
// Sent a few days before Stripe charges the card, so a renewal is never a
// surprise. When a plan change is already scheduled it says so here too — this
// is the last email before the new price applies.
export async function sendRenewalReminder(params: {
  to: string;
  tierName: string;
  amountLabel: string;
  renewsOnLabel: string;
  pendingTierName?: string | null;
}): Promise<boolean> {
  const { to, tierName, amountLabel, renewsOnLabel, pendingTierName } = params;
  const switching = Boolean(pendingTierName && pendingTierName !== tierName);

  const blocks: EmailBlock[] = [
    {
      kind: "paragraph",
      text: switching
        ? `Your scheduled plan change takes effect on ${renewsOnLabel}. Here's what will be charged and what changes.`
        : `Your ReelSpy subscription renews on ${renewsOnLabel}. Here's what to expect, in advance.`,
    },
    {
      kind: "rows",
      caption: "Upcoming charge",
      rows: [
        { label: "Current plan", value: `ReelSpy ${tierName}` },
        ...(switching ? [{ label: "Plan from renewal", value: `ReelSpy ${pendingTierName}`, emphasis: true }] : []),
        { label: "Renews on", value: renewsOnLabel },
        { label: "Amount", value: amountLabel, emphasis: true },
      ],
    },
  ];

  if (switching) {
    blocks.push({
      kind: "callout",
      text: `You're on ${tierName} until ${renewsOnLabel}. From that date your subscription becomes ${pendingTierName} and the new limits apply. You can still call this change off from the billing page until then.`,
    });
  }

  blocks.push({
    kind: "paragraph",
    text: "If your card has changed, update it before the renewal date so nothing is interrupted.",
    muted: true,
  });

  const { html, text } = buildEmail({
    eyebrow: "Billing",
    preheader: `${amountLabel} will be charged on ${renewsOnLabel}.`,
    title: switching
      ? `Your plan changes to ${pendingTierName} on ${renewsOnLabel}`
      : `Your ReelSpy ${tierName} plan renews on ${renewsOnLabel}`,
    blocks,
    cta: { href: billingUrl(), label: "Review billing" },
    footnote: "No action is needed if everything above looks right.",
    reason: PLAN_REASON,
  });

  return sendEmail({
    to,
    subject: switching
      ? `Heads-up: your ReelSpy plan changes to ${pendingTierName} on ${renewsOnLabel}`
      : `Your ReelSpy renewal — ${amountLabel} on ${renewsOnLabel}`,
    html,
    text,
  });
}

// ── Payment failed / dunning ─────────────────────────────────────────────────
export async function sendPaymentFailed(params: {
  to: string;
  tierName: string;
  amountLabel?: string | null;
  nextAttemptLabel?: string | null;
  invoiceUrl?: string | null;
}): Promise<boolean> {
  const { to, tierName, amountLabel, nextAttemptLabel, invoiceUrl } = params;

  const { html, text } = buildEmail({
    eyebrow: "Action needed",
    preheader: `We couldn't charge your card for ReelSpy ${tierName}. Your plan stays active while we retry.`,
    title: "Your payment didn't go through",
    blocks: [
      {
        kind: "paragraph",
        text: `We tried to charge your payment method for your ReelSpy ${tierName} plan and the bank declined it. This is usually an expired card, a spending limit, or a bank block on online payments.`,
      },
      {
        kind: "rows",
        caption: "Failed payment",
        rows: [
          { label: "Plan", value: `ReelSpy ${tierName}` },
          ...(amountLabel ? [{ label: "Amount due", value: amountLabel, emphasis: true }] : []),
          ...(nextAttemptLabel ? [{ label: "Next automatic retry", value: nextAttemptLabel }] : []),
        ],
      },
      {
        kind: "bullets",
        caption: "How to fix it",
        items: [
          "Open the billing page and update your card — the charge is retried immediately.",
          "Or check with your bank that online/recurring payments are allowed.",
          "Stripe also retries automatically over the next few days.",
        ],
      },
      {
        kind: "callout",
        tone: "warn",
        text:
          "Your plan is still active for now. If every retry fails, the subscription ends and your account moves to the Free plan — your data stays, but paid limits and models stop.",
      },
    ],
    cta: { href: billingUrl(), label: "Update payment method" },
    ...(invoiceUrl ? { secondary: { href: invoiceUrl, label: "View the unpaid invoice" } } : {}),
    reason: PLAN_REASON,
  });

  return sendEmail({ to, subject: `Action needed — your ReelSpy payment failed`, html, text });
}

// ── Plan change scheduled (upgrade or downgrade) ─────────────────────────────
// The single most important email in this file: it's the written record of the
// end-of-period policy the billing UI promises. It must be unambiguous about
// three things — nothing is charged today, nothing changes today, and the change
// can still be called off.
export async function sendPlanChangeScheduled(params: {
  to: string;
  currentTierName: string;
  nextTier: AiTier;
  nextTierName: string;
  effectiveOnLabel: string;
  nextPriceLabel?: string | null;
  nextEntitlements?: Entitlements | null;
  direction: "upgrade" | "downgrade" | "change";
}): Promise<boolean> {
  const {
    to,
    currentTierName,
    nextTier,
    nextTierName,
    effectiveOnLabel,
    nextPriceLabel,
    nextEntitlements,
    direction,
  } = params;

  const verb = direction === "upgrade" ? "upgrade" : direction === "downgrade" ? "downgrade" : "plan change";

  const { html, text } = buildEmail({
    eyebrow: "Plan change",
    preheader: `Nothing changes today — your ${nextTierName} plan starts on ${effectiveOnLabel}.`,
    title: `Your plan changes to ${nextTierName} on ${effectiveOnLabel}`,
    blocks: [
      {
        kind: "paragraph",
        text: `Your ${verb} is booked. You've already paid for your current billing period, so you keep ReelSpy ${currentTierName} — with every limit and feature it includes — right up until ${effectiveOnLabel}.`,
      },
      {
        kind: "rows",
        caption: "What was scheduled",
        rows: [
          { label: "Plan until " + effectiveOnLabel, value: `ReelSpy ${currentTierName}` },
          { label: "Plan from " + effectiveOnLabel, value: `ReelSpy ${nextTierName}`, emphasis: true },
          ...(nextPriceLabel ? [{ label: "Price from then", value: `${nextPriceLabel} / month` }] : []),
          { label: "Charged today", value: "Nothing" },
        ],
      },
      {
        kind: "callout",
        tone: "success",
        text: `Nothing changes in your account today. On ${effectiveOnLabel} your subscription renews on the ${nextTierName} plan${
          nextPriceLabel ? ` at ${nextPriceLabel}` : ""
        }, and your new limits apply from that moment.`,
      },
      {
        kind: "bullets",
        caption: `What ${nextTierName} gives you from ${effectiveOnLabel}`,
        items: planHighlights(nextTier, nextEntitlements),
      },
    ],
    cta: { href: billingUrl(), label: "View scheduled change" },
    footnote: `Changed your mind? You can cancel this scheduled change from the billing page any time before ${effectiveOnLabel} and stay on ${currentTierName} — nothing has been charged for it.`,
    reason: PLAN_REASON,
  });

  return sendEmail({
    to,
    subject: `Confirmed: your ReelSpy plan changes to ${nextTierName} on ${effectiveOnLabel}`,
    html,
    text,
  });
}

// ── Plan change applied ──────────────────────────────────────────────────────
// Two ways to arrive here, and the customer needs to be told which:
//   immediate  — they upgraded, it's live now, and they were invoiced only the
//                prorated difference for the rest of the current period.
//   scheduled  — a booked change reached its renewal date and went live.
export async function sendPlanChangeApplied(params: {
  to: string;
  previousTierName: string;
  tier: AiTier;
  tierName: string;
  entitlements?: Entitlements | null;
  amountLabel?: string | null;
  renewsOnLabel?: string | null;
  immediate?: boolean;
  /** Prorated amount invoiced today (immediate upgrades only). */
  chargedLabel?: string | null;
  invoiceUrl?: string | null;
}): Promise<boolean> {
  const {
    to,
    previousTierName,
    tier,
    tierName,
    entitlements,
    amountLabel,
    renewsOnLabel,
    immediate,
    chargedLabel,
    invoiceUrl,
  } = params;

  const intro = immediate
    ? `Your upgrade is live — every ${tierName} feature and limit is available in your account right now.${
        chargedLabel
          ? ` We've charged ${chargedLabel}: that's the prorated difference for the days left in your current billing period, with credit for the ${previousTierName} time you'd already paid for.`
          : ` Nothing extra was charged today — the credit for your unused ${previousTierName} time covered the difference.`
      }`
    : `The plan change you scheduled has taken effect at your renewal, exactly as booked. Your previous ${previousTierName} period ran to the end, and ${tierName} is now live on your account.`;

  const { html, text } = buildEmail({
    eyebrow: "Plan change",
    preheader: immediate
      ? `Your upgrade to ReelSpy ${tierName} is live.`
      : `Your scheduled change is live — you're now on ReelSpy ${tierName}.`,
    title: `You're now on ReelSpy ${tierName}`,
    blocks: [
      { kind: "paragraph", text: intro },
      {
        kind: "rows",
        caption: "Your plan now",
        rows: [
          { label: "Previous plan", value: `ReelSpy ${previousTierName}` },
          { label: "Current plan", value: `ReelSpy ${tierName}`, emphasis: true },
          ...(immediate ? [{ label: "Charged today", value: chargedLabel ?? "Nothing" }] : []),
          ...(amountLabel
            ? [{ label: immediate ? "From your next renewal" : "Monthly price", value: `${amountLabel} / month` }]
            : []),
          ...(renewsOnLabel ? [{ label: "Next renewal", value: renewsOnLabel }] : []),
        ],
      },
      { kind: "bullets", caption: "What's included now", items: planHighlights(tier, entitlements) },
    ],
    cta: { href: `${getSiteUrl()}/dashboard`, label: "Open ReelSpy" },
    secondary: invoiceUrl
      ? { href: invoiceUrl, label: "View invoice / receipt (PDF)" }
      : { href: billingUrl(), label: "View billing" },
    ...(immediate
      ? {
          footnote:
            "Moving to a lower plan later works the other way round: it starts at your next renewal, so you keep what you've paid for.",
        }
      : {}),
    reason: PLAN_REASON,
  });

  return sendEmail({ to, subject: `Your ReelSpy plan is now ${tierName}`, html, text });
}

// ── Scheduled plan change called off ─────────────────────────────────────────
export async function sendPlanChangeCancelled(params: {
  to: string;
  tierName: string;
  cancelledTierName: string;
  renewsOnLabel?: string | null;
}): Promise<boolean> {
  const { to, tierName, cancelledTierName, renewsOnLabel } = params;

  const { html, text } = buildEmail({
    eyebrow: "Plan change",
    preheader: `You're staying on ReelSpy ${tierName} — the scheduled change to ${cancelledTierName} was cancelled.`,
    title: "Your scheduled plan change was cancelled",
    blocks: [
      {
        kind: "paragraph",
        text: `We've called off the switch to ${cancelledTierName}. You stay on ReelSpy ${tierName} and it keeps renewing as it did before — no change to your limits, and nothing extra charged.`,
      },
      {
        kind: "rows",
        caption: "Where you stand",
        rows: [
          { label: "Your plan", value: `ReelSpy ${tierName}`, emphasis: true },
          { label: "Cancelled change", value: `ReelSpy ${cancelledTierName}` },
          ...(renewsOnLabel ? [{ label: "Next renewal", value: renewsOnLabel }] : []),
        ],
      },
    ],
    cta: { href: billingUrl(), label: "View billing" },
    footnote: "You can schedule a different plan any time — changes always start at your next renewal date.",
    reason: PLAN_REASON,
  });

  return sendEmail({ to, subject: `Your ReelSpy plan change was cancelled — you're staying on ${tierName}`, html, text });
}

// ── Cancellation scheduled (cancel at period end) ────────────────────────────
export async function sendCancellationScheduled(params: {
  to: string;
  tierName: string;
  accessUntilLabel?: string | null;
}): Promise<boolean> {
  const { to, tierName, accessUntilLabel } = params;
  const untilPhrase = accessUntilLabel ? `until ${accessUntilLabel}` : "until the end of your current billing period";

  const { html, text } = buildEmail({
    eyebrow: "Billing",
    preheader: `Your ${tierName} plan stays active ${untilPhrase}, then moves to Free.`,
    title: accessUntilLabel
      ? `Your ReelSpy ${tierName} plan ends on ${accessUntilLabel}`
      : `Your ReelSpy ${tierName} plan is set to end`,
    blocks: [
      {
        kind: "paragraph",
        text: `We've scheduled your cancellation. You've paid for your current period, so nothing is cut short — you keep full ${tierName} access ${untilPhrase}. You won't be charged again.`,
      },
      {
        kind: "rows",
        caption: "What happens next",
        rows: [
          { label: "Plan", value: `ReelSpy ${tierName}` },
          ...(accessUntilLabel ? [{ label: "Access until", value: accessUntilLabel, emphasis: true }] : []),
          { label: "Future charges", value: "None" },
          { label: "After that date", value: "Free plan" },
        ],
      },
      {
        kind: "bullets",
        caption: "On the Free plan",
        items: [
          "Your account, tracked accounts, scripts and saved hooks all stay — nothing is deleted.",
          "Monthly limits drop to the Free tier and premium AI models stop.",
          "Resubscribing restores your paid limits immediately.",
        ],
      },
      {
        kind: "callout",
        text: `Changed your mind? Resuming before ${accessUntilLabel ?? "the end date"} keeps everything exactly as it is — no new charge until your normal renewal date.`,
      },
    ],
    cta: { href: billingUrl(), label: "Keep my plan" },
    footnote: "If you cancelled by accident, resuming takes one click on the billing page.",
    reason: PLAN_REASON,
  });

  return sendEmail({
    to,
    subject: accessUntilLabel
      ? `Your ReelSpy ${tierName} plan ends on ${accessUntilLabel}`
      : `Your ReelSpy ${tierName} plan is scheduled to end`,
    html,
    text,
  });
}

// ── Cancellation called off ──────────────────────────────────────────────────
export async function sendSubscriptionResumed(params: {
  to: string;
  tierName: string;
  renewsOnLabel?: string | null;
  amountLabel?: string | null;
}): Promise<boolean> {
  const { to, tierName, renewsOnLabel, amountLabel } = params;

  const { html, text } = buildEmail({
    eyebrow: "Billing",
    preheader: `Your ReelSpy ${tierName} subscription will continue as normal.`,
    title: "Your subscription will continue",
    blocks: [
      {
        kind: "paragraph",
        text: `Good news — the cancellation has been called off. Your ReelSpy ${tierName} plan stays active and renews as usual, with no break in access.`,
      },
      {
        kind: "rows",
        caption: "Your subscription",
        rows: [
          { label: "Plan", value: `ReelSpy ${tierName}`, emphasis: true },
          ...(renewsOnLabel ? [{ label: "Next renewal", value: renewsOnLabel }] : []),
          ...(amountLabel ? [{ label: "Amount", value: `${amountLabel} / month` }] : []),
        ],
      },
    ],
    cta: { href: `${getSiteUrl()}/dashboard`, label: "Open ReelSpy" },
    reason: PLAN_REASON,
  });

  return sendEmail({ to, subject: `Your ReelSpy ${tierName} subscription will continue`, html, text });
}

// ── Subscription ended ───────────────────────────────────────────────────────
export async function sendSubscriptionCancelled(params: {
  to: string;
  tierName: string;
  accessUntilLabel?: string | null;
}): Promise<boolean> {
  const { to, tierName, accessUntilLabel } = params;

  const { html, text } = buildEmail({
    eyebrow: "Billing",
    preheader: accessUntilLabel
      ? `You keep ${tierName} access until ${accessUntilLabel}.`
      : `Your account has moved to the Free plan.`,
    title: `Your ReelSpy ${tierName} plan has ended`,
    blocks: [
      {
        kind: "paragraph",
        text: accessUntilLabel
          ? `Your subscription is cancelled. You keep ${tierName} access until ${accessUntilLabel}, then your account moves to the Free plan.`
          : `Your subscription has ended and your account is now on the Free plan. Thank you for having been a ReelSpy ${tierName} subscriber.`,
      },
      {
        kind: "bullets",
        caption: "What stays",
        items: [
          "Your account and everything in it — tracked accounts, reels, scripts and saved hooks.",
          "Free-plan limits and access, for as long as you want them.",
          "Your billing history and invoices, available any time from the billing page.",
        ],
      },
      {
        kind: "paragraph",
        text: "If something wasn't working for you, reply to this email — we read every response and it genuinely shapes what we build.",
      },
    ],
    cta: { href: billingUrl(), label: "Resubscribe" },
    footnote: "Resubscribing restores your paid limits straight away — you pick up exactly where you left off.",
    reason: "You're receiving this because you had a paid ReelSpy subscription.",
  });

  return sendEmail({ to, subject: `Your ReelSpy ${tierName} subscription has ended`, html, text });
}

// ── Refund issued ────────────────────────────────────────────────────────────
// Money-only by design: if the refund also cancelled the plan, the customer gets
// a separate cancellation email (fired by the subscription.deleted event), so
// this one never has to speak to access state.
export async function sendRefundIssued(params: {
  to: string;
  amountLabel: string;
  full?: boolean;
}): Promise<boolean> {
  const { to, amountLabel, full } = params;

  const { html, text } = buildEmail({
    eyebrow: "Refund",
    preheader: `${amountLabel} is on its way back to your original payment method.`,
    title: "Your refund is on its way",
    blocks: [
      {
        kind: "paragraph",
        text: `We've issued a ${full === false ? "partial " : ""}refund of ${amountLabel} to the card you paid with. Refunds are processed by your bank, so it usually lands within 5–10 business days.`,
      },
      {
        kind: "rows",
        caption: "Refund details",
        rows: [
          { label: "Amount refunded", value: amountLabel, emphasis: true },
          { label: "Refunded to", value: "Your original payment method" },
          { label: "Expected arrival", value: "5–10 business days" },
        ],
      },
      {
        kind: "paragraph",
        text: "If it hasn't appeared after 10 business days, reply to this email with the date and we'll trace it with Stripe.",
        muted: true,
      },
    ],
    cta: { href: billingUrl(), label: "View billing" },
    reason: "You're receiving this because a refund was issued on your ReelSpy account.",
  });

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
  dueByLabel?: string | null;
}): Promise<boolean> {
  const to = (process.env.BILLING_ALERT_EMAIL || process.env.EMAIL_FROM || "").trim();
  if (!to) return false;
  const { chargeId, amountLabel, reason, customerEmail, dueByLabel } = params;

  const { html, text } = buildEmail({
    eyebrow: "Internal alert",
    preheader: `A customer disputed ${amountLabel}. Evidence is due before Stripe's deadline.`,
    title: `New Stripe dispute — ${amountLabel}`,
    blocks: [
      { kind: "paragraph", text: "A customer opened a dispute (chargeback). Stripe has already debited the amount plus the dispute fee; responding with evidence is the only way to get it back." },
      {
        kind: "rows",
        caption: "Dispute",
        rows: [
          { label: "Amount", value: amountLabel, emphasis: true },
          { label: "Charge", value: chargeId },
          ...(reason ? [{ label: "Stated reason", value: reason }] : []),
          ...(customerEmail ? [{ label: "Customer", value: customerEmail }] : []),
          ...(dueByLabel ? [{ label: "Evidence due", value: dueByLabel }] : []),
        ],
      },
    ],
    cta: { href: "https://dashboard.stripe.com/disputes", label: "Respond in Stripe" },
    footnote: "Respond before Stripe's evidence deadline or the dispute is lost by default.",
    reason: "Internal ReelSpy billing alert.",
  });

  return sendEmail({ to, subject: `[ReelSpy] Stripe dispute opened — ${amountLabel}`, html, text });
}
