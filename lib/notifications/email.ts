// The two internal emails this feature sends: one alert, and one digest.
//
// Both are composed on the SAME branded template every customer-facing email
// uses (lib/email/layout.ts) rather than a plain-text dump — partly so the
// founder's alerts are as readable on a phone as the product's own mail, and
// partly because an internal email that renders badly is the first sign the
// shared template has regressed.
//
// Server-only and fail-open: every send goes through `sendEmail`, which returns
// false instead of throwing when the mailer isn't configured.

import "server-only";
import { sendEmail } from "@/lib/email/send";
import { buildEmail, type EmailBlock, type Tone } from "@/lib/email/layout";
import { getSiteUrl } from "@/lib/site";
import { CATEGORY_LABELS, type AlertCategory, type Severity } from "@/lib/notifications/catalog";

// What the notifier hands the mailer. Deliberately not the DB row: the digest
// composes these from rows, and `sendTestAlert` composes one from nothing.
export type AlertMail = {
  event: string;
  category: AlertCategory;
  severity: Severity;
  title: string;
  summary?: string | null;
  context?: Record<string, string>;
  /** Relative admin path to act on it, e.g. "/admin/waitlist". */
  link?: string | null;
  repeatCount?: number;
  occurredAt?: Date;
};

const SEVERITY_TONE: Record<Severity, Tone> = {
  info: "neutral",
  warning: "warn",
  critical: "danger",
};

const SEVERITY_LABEL: Record<Severity, string> = {
  info: "FYI",
  warning: "Needs a look",
  critical: "Act now",
};

// Subject lines carry the severity so a phone lock screen is enough to decide
// whether to open it — that decision is the entire point of alerting.
function subjectPrefix(severity: Severity): string {
  return severity === "critical" ? "[ReelSpy ALERT]" : severity === "warning" ? "[ReelSpy]" : "[ReelSpy FYI]";
}

function absolute(link?: string | null): string | null {
  if (!link) return null;
  return link.startsWith("http") ? link : `${getSiteUrl()}${link}`;
}

function contextRows(context: Record<string, string> | undefined) {
  const entries = Object.entries(context ?? {}).filter(([, v]) => v !== "" && v != null);
  if (entries.length === 0) return null;
  return entries.map(([label, value]) => ({ label, value: String(value).slice(0, 300) }));
}

/** One alert, one email. Used for anything not batched into the digest. */
export async function sendAlertEmail(to: string[], alert: AlertMail): Promise<boolean> {
  if (to.length === 0) return false;

  const blocks: EmailBlock[] = [
    {
      kind: "callout",
      text: `${SEVERITY_LABEL[alert.severity]} · ${CATEGORY_LABELS[alert.category]}${
        alert.repeatCount && alert.repeatCount > 1 ? ` · ${alert.repeatCount}× in this window` : ""
      }`,
      tone: SEVERITY_TONE[alert.severity],
    },
  ];
  if (alert.summary) blocks.push({ kind: "paragraph", text: alert.summary });

  const rows = contextRows(alert.context);
  if (rows) blocks.push({ kind: "rows", caption: "Details", rows });

  const href = absolute(alert.link);
  const { html, text } = buildEmail({
    eyebrow: "Internal alert",
    preheader: alert.summary?.slice(0, 140) ?? alert.title,
    title: alert.title,
    blocks,
    ...(href ? { cta: { href, label: "Open in admin" } } : {}),
    secondary: {
      href: `${getSiteUrl()}/admin/notifications`,
      label: "Alert settings",
    },
    footnote:
      "You're getting this because this event is switched on in Admin → Notifications. Turn it off there, batch it into the digest, or raise the severity floor.",
    reason: "Internal ReelSpy operations alert.",
  });

  // One send per recipient rather than a shared To: header — internal alerts
  // quote customer emails and Stripe amounts, and one admin should not learn
  // who the others are from a header.
  const results = await Promise.all(
    to.map((recipient) =>
      sendEmail({ to: recipient, subject: `${subjectPrefix(alert.severity)} ${alert.title}`, html, text })
    )
  );
  return results.some(Boolean);
}

/**
 * The periodic roll-up of everything that was batched. Grouped by category so
 * "3 people joined the waiting list, 1 payment failed" reads as a status
 * report, not as a queue dump.
 */
export async function sendDigestEmail(
  to: string[],
  alerts: AlertMail[],
  windowLabel: string
): Promise<boolean> {
  if (to.length === 0 || alerts.length === 0) return false;

  const worst: Severity = alerts.some((a) => a.severity === "critical")
    ? "critical"
    : alerts.some((a) => a.severity === "warning")
      ? "warning"
      : "info";

  const blocks: EmailBlock[] = [
    {
      kind: "paragraph",
      text: `${alerts.length} thing${alerts.length === 1 ? "" : "s"} happened ${windowLabel}. Nothing here was urgent enough to email on its own — that's what makes this one email instead of ${alerts.length}.`,
    },
  ];

  const categories = [...new Set(alerts.map((a) => a.category))];
  for (const category of categories) {
    const inCategory = alerts.filter((a) => a.category === category);
    blocks.push({ kind: "heading", text: CATEGORY_LABELS[category] });
    blocks.push({
      kind: "bullets",
      items: inCategory.map((a) => {
        const repeat = a.repeatCount && a.repeatCount > 1 ? ` (×${a.repeatCount})` : "";
        const detail = a.summary ? ` — ${a.summary}` : "";
        return `${a.title}${repeat}${detail}`.slice(0, 300);
      }),
    });
  }

  const { html, text } = buildEmail({
    eyebrow: "Digest",
    preheader: `${alerts.length} alert${alerts.length === 1 ? "" : "s"} ${windowLabel}.`,
    title: `ReelSpy activity — ${alerts.length} alert${alerts.length === 1 ? "" : "s"}`,
    blocks,
    cta: { href: `${getSiteUrl()}/admin/notifications`, label: "Open the alert inbox" },
    footnote: "Change what lands in this digest, or how often it arrives, in Admin → Notifications.",
    reason: "Internal ReelSpy operations digest.",
  });

  const results = await Promise.all(
    to.map((recipient) =>
      sendEmail({
        to: recipient,
        subject: `${subjectPrefix(worst)} Activity digest — ${alerts.length} alert${
          alerts.length === 1 ? "" : "s"
        }`,
        html,
        text,
      })
    )
  );
  return results.some(Boolean);
}
