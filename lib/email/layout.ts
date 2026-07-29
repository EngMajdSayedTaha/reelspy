// The ReelSpy transactional email design system.
//
// ONE template renders EVERY email the product sends — billing, publishing,
// digests, internal alerts — so a customer who gets a receipt, a dunning notice
// and a weekly digest sees the same brand each time: the ReelSpy mark on the
// dark header band, the same type scale, the same yellow call-to-action, the
// same footer with support and legal links.
//
// Emails are declared as CONTENT, not markup: a title, some blocks, a CTA. This
// module turns that into (a) table-based HTML that survives Outlook/Gmail and
// (b) the plain-text alternative — from the same object, so the two can never
// drift apart, and no template has to hand-roll HTML again.
//
// No imports beyond the site origin: pure string building, safe to unit-test.

import { getSiteUrl } from "@/lib/site";

export const SUPPORT_EMAIL = "support@reelspy.dev";

// Brand tokens, mirrored from the app's theme. Inline hex only — mail clients
// don't get CSS variables.
const BRAND = {
  accent: "#F9E400",
  ink: "#121212",
  text: "#0F172A",
  muted: "#475569",
  faint: "#94A3B8",
  line: "#E2E8F0",
  panel: "#F8FAFC",
  page: "#F1F5F9",
  success: "#15803D",
  successBg: "#F0FDF4",
  warn: "#B45309",
  warnBg: "#FFFBEB",
  danger: "#B91C1C",
  dangerBg: "#FEF2F2",
} as const;

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// The logo has to be an absolute URL on a public origin — mail clients can't
// resolve relative paths and most block anything that isn't plain https.
export function logoUrl(): string {
  return `${getSiteUrl()}/brand/reelspy-logo-512.png`;
}

export type Tone = "neutral" | "success" | "warn" | "danger";

export type EmailButton = { href: string; label: string };
export type EmailRow = { label: string; value: string; emphasis?: boolean };
export type LinkListItem = { title: string; subtitle?: string; href: string; linkLabel: string; meta?: string };

export type EmailBlock =
  | { kind: "paragraph"; text: string; muted?: boolean }
  | { kind: "heading"; text: string }
  | { kind: "rows"; caption?: string; rows: EmailRow[] }
  | { kind: "bullets"; caption?: string; items: string[] }
  | { kind: "callout"; text: string; tone?: Tone }
  | { kind: "linkList"; caption?: string; items: LinkListItem[] };

export type EmailContent = {
  /** Category shown in the header band ("Billing", "Receipt", "Publishing"). */
  eyebrow: string;
  /** The grey line clients preview next to the subject — always set it. */
  preheader: string;
  title: string;
  blocks: EmailBlock[];
  cta?: EmailButton;
  /** Rendered as a plain link under the CTA (e.g. "View invoice"). */
  secondary?: EmailButton;
  /** Small print directly under the actions. */
  footnote?: string;
  /** Why this person is getting this email — shown in the footer. */
  reason?: string;
  unsubscribeUrl?: string | null;
};

const toneStyles: Record<Tone, { bg: string; border: string; color: string }> = {
  neutral: { bg: BRAND.panel, border: BRAND.line, color: BRAND.text },
  success: { bg: BRAND.successBg, border: "#BBF7D0", color: BRAND.success },
  warn: { bg: BRAND.warnBg, border: "#FDE68A", color: BRAND.warn },
  danger: { bg: BRAND.dangerBg, border: "#FECACA", color: BRAND.danger },
};

// ── block rendering ──────────────────────────────────────────────────────────

function renderBlockHtml(block: EmailBlock): string {
  switch (block.kind) {
    case "paragraph":
      return `<p class="t-muted" style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${
        block.muted ? BRAND.faint : BRAND.muted
      }">${escapeHtml(block.text)}</p>`;

    case "heading":
      return `<h2 class="t-ink" style="margin:24px 0 10px;font-size:15px;line-height:1.4;color:${BRAND.text};font-weight:700;letter-spacing:-0.1px">${escapeHtml(
        block.text
      )}</h2>`;

    case "rows": {
      const caption = block.caption
        ? `<p class="t-faint" style="margin:0 0 8px;font-size:12px;letter-spacing:0.6px;text-transform:uppercase;color:${BRAND.faint};font-weight:600">${escapeHtml(
            block.caption
          )}</p>`
        : "";
      const rows = block.rows
        .map(
          (r, i) => `
          <tr>
            <td class="t-muted" style="padding:${i === 0 ? "0" : "10px"} 12px 10px 0;font-size:14px;line-height:1.5;color:${BRAND.muted};border-bottom:1px solid ${BRAND.line}">${escapeHtml(
              r.label
            )}</td>
            <td class="t-ink" align="right" style="padding:${i === 0 ? "0" : "10px"} 0 10px 12px;font-size:14px;line-height:1.5;color:${BRAND.text};font-weight:${
              r.emphasis ? "700" : "600"
            };border-bottom:1px solid ${BRAND.line};white-space:nowrap">${escapeHtml(r.value)}</td>
          </tr>`
        )
        .join("");
      return `${caption}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="panel" style="width:100%;background:${BRAND.panel};border:1px solid ${BRAND.line};border-radius:12px;padding:16px 18px;margin:0 0 20px">${rows}</table>`;
    }

    case "bullets": {
      const caption = block.caption
        ? `<p class="t-faint" style="margin:0 0 8px;font-size:12px;letter-spacing:0.6px;text-transform:uppercase;color:${BRAND.faint};font-weight:600">${escapeHtml(
            block.caption
          )}</p>`
        : "";
      const items = block.items
        .map(
          (item) =>
            `<li class="t-muted" style="margin:0 0 8px;font-size:14px;line-height:1.6;color:${BRAND.muted}">${escapeHtml(item)}</li>`
        )
        .join("");
      return `${caption}<ul style="margin:0 0 20px;padding-left:20px">${items}</ul>`;
    }

    case "callout": {
      const tone = toneStyles[block.tone ?? "neutral"];
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px"><tr><td class="panel" style="background:${tone.bg};border:1px solid ${tone.border};border-radius:12px;padding:14px 16px;font-size:14px;line-height:1.6;color:${tone.color}">${escapeHtml(
        block.text
      )}</td></tr></table>`;
    }

    case "linkList": {
      const caption = block.caption
        ? `<h2 class="t-ink" style="margin:0 0 10px;font-size:15px;color:${BRAND.text};font-weight:700">${escapeHtml(block.caption)}</h2>`
        : "";
      const rows = block.items
        .map(
          (item) => `
          <tr>
            <td style="padding:12px 0;border-bottom:1px solid ${BRAND.line}">
              <div class="t-ink" style="font-size:14px;line-height:1.4;color:${BRAND.text};font-weight:600">${escapeHtml(item.title)}${
                item.meta
                  ? `<span class="t-faint" style="font-weight:400;color:${BRAND.faint}"> · ${escapeHtml(item.meta)}</span>`
                  : ""
              }</div>
              ${
                item.subtitle
                  ? `<div class="t-muted" style="font-size:13px;line-height:1.5;color:${BRAND.muted};margin:3px 0 6px">${escapeHtml(item.subtitle)}</div>`
                  : ""
              }
              <a href="${encodeURI(item.href)}" style="font-size:13px;color:#A16207;font-weight:600;text-decoration:none">${escapeHtml(item.linkLabel)} &rarr;</a>
            </td>
          </tr>`
        )
        .join("");
      return `${caption}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 20px">${rows}</table>`;
    }
  }
}

function renderBlockText(block: EmailBlock): string[] {
  switch (block.kind) {
    case "paragraph":
      return [block.text, ""];
    case "heading":
      return [block.text.toUpperCase(), ""];
    case "rows":
      return [
        ...(block.caption ? [`${block.caption}:`] : []),
        ...block.rows.map((r) => `  ${r.label}: ${r.value}`),
        "",
      ];
    case "bullets":
      return [...(block.caption ? [`${block.caption}:`] : []), ...block.items.map((i) => `  - ${i}`), ""];
    case "callout":
      return [block.text, ""];
    case "linkList":
      return [
        ...(block.caption ? [`${block.caption}:`] : []),
        ...block.items.flatMap((i) => [
          `  - ${i.title}${i.meta ? ` (${i.meta})` : ""}`,
          ...(i.subtitle ? [`    ${i.subtitle}`] : []),
          `    ${i.linkLabel}: ${i.href}`,
        ]),
        "",
      ];
  }
}

// ── the shell ────────────────────────────────────────────────────────────────

function ctaHtml(cta: EmailButton): string {
  // Padded anchor inside a rounded cell: renders as a real button everywhere,
  // and mso-padding-alt keeps Outlook's box from collapsing.
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 0">
    <tr>
      <td align="center" style="background:${BRAND.accent};border-radius:10px;mso-padding-alt:14px 28px">
        <a href="${encodeURI(cta.href)}" style="display:inline-block;padding:13px 28px;font-family:${FONT};font-size:15px;font-weight:700;line-height:1;color:${BRAND.ink};text-decoration:none;border-radius:10px">${escapeHtml(
          cta.label
        )}</a>
      </td>
    </tr>
  </table>`;
}

export function buildEmail(content: EmailContent): { html: string; text: string } {
  const site = getSiteUrl();
  const year = new Date().getUTCFullYear();
  const blocksHtml = content.blocks.map(renderBlockHtml).join("\n");

  const actionsHtml = [
    content.cta ? ctaHtml(content.cta) : "",
    content.secondary
      ? `<p style="margin:14px 0 0;font-size:14px;line-height:1.5"><a href="${encodeURI(
          content.secondary.href
        )}" class="t-muted" style="color:${BRAND.muted};text-decoration:underline">${escapeHtml(content.secondary.label)}</a></p>`
      : "",
    content.footnote
      ? `<p class="t-faint" style="margin:20px 0 0;font-size:12px;line-height:1.6;color:${BRAND.faint}">${escapeHtml(content.footnote)}</p>`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(content.title)}</title>
<style>
  body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
  img{border:0;line-height:100%;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic}
  a{color:inherit}
  @media only screen and (max-width:620px){
    .sm-full{width:100%!important;max-width:100%!important}
    .sm-pad{padding-left:22px!important;padding-right:22px!important}
  }
  @media (prefers-color-scheme:dark){
    .page{background:#0A0A0A!important}
    .card{background:#161616!important;border-color:#2A2A2A!important}
    .panel{background:#1C1C1C!important;border-color:#2E2E2E!important}
    .footer{background:#111111!important;border-color:#2A2A2A!important}
    .t-ink{color:#F4F4F5!important}
    .t-muted{color:#B4B4B8!important}
    .t-faint{color:#8A8A90!important}
    .rule{border-color:#2A2A2A!important}
  }
</style>
</head>
<body class="page" style="margin:0;padding:0;width:100%;background:${BRAND.page};font-family:${FONT}">
<div style="display:none;font-size:1px;color:${BRAND.page};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">${escapeHtml(
    content.preheader
  )}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="page" style="background:${BRAND.page}">
  <tr>
    <td align="center" style="padding:28px 12px">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="sm-full card" style="width:600px;max-width:600px;background:#FFFFFF;border:1px solid ${BRAND.line};border-radius:16px;overflow:hidden">

        <tr>
          <td style="background:${BRAND.ink};padding:20px 32px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="left" style="vertical-align:middle">
                  <a href="${site}" style="text-decoration:none">
                    <img src="${logoUrl()}" width="36" height="36" alt="ReelSpy" style="display:inline-block;vertical-align:middle;border-radius:9px">
                    <span style="display:inline-block;vertical-align:middle;padding-left:10px;font-family:${FONT};font-size:17px;font-weight:700;letter-spacing:-0.2px;color:#FFFFFF">ReelSpy</span>
                  </a>
                </td>
                <td align="right" style="vertical-align:middle;font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:#8A8A8A">${escapeHtml(
                  content.eyebrow
                )}</td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td class="sm-pad" style="padding:32px 32px 34px">
            <h1 class="t-ink" style="margin:0 0 14px;font-family:${FONT};font-size:22px;line-height:1.3;font-weight:700;letter-spacing:-0.3px;color:${BRAND.text}">${escapeHtml(
              content.title
            )}</h1>
            ${blocksHtml}
            ${actionsHtml}
          </td>
        </tr>

        <tr>
          <td class="sm-pad footer" style="background:${BRAND.panel};border-top:1px solid ${BRAND.line};padding:22px 32px">
            <p class="t-muted" style="margin:0 0 10px;font-family:${FONT};font-size:13px;line-height:1.6;color:${BRAND.muted}">
              Questions about this email? Reply to it, or write to
              <a href="mailto:${SUPPORT_EMAIL}" style="color:${BRAND.muted};text-decoration:underline">${SUPPORT_EMAIL}</a> — a human answers.
            </p>
            <p class="t-faint" style="margin:0 0 10px;font-family:${FONT};font-size:12px;line-height:1.7;color:${BRAND.faint}">
              <a href="${site}/dashboard/billing" style="color:${BRAND.faint};text-decoration:none">Billing</a> &nbsp;·&nbsp;
              <a href="${site}/dashboard" style="color:${BRAND.faint};text-decoration:none">Dashboard</a> &nbsp;·&nbsp;
              <a href="${site}/terms" style="color:${BRAND.faint};text-decoration:none">Terms</a> &nbsp;·&nbsp;
              <a href="${site}/privacy" style="color:${BRAND.faint};text-decoration:none">Privacy</a>
            </p>
            <p class="t-faint" style="margin:0;font-family:${FONT};font-size:11px;line-height:1.7;color:${BRAND.faint}">
              ${escapeHtml(content.reason ?? "You're receiving this because you have a ReelSpy account.")}${
                content.unsubscribeUrl
                  ? ` <a href="${encodeURI(content.unsubscribeUrl)}" style="color:${BRAND.faint};text-decoration:underline">Unsubscribe</a>.`
                  : ""
              }<br>
              &copy; ${year} ReelSpy · Dubai, United Arab Emirates
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  const textLines = [
    "REELSPY",
    "",
    content.title,
    "",
    ...content.blocks.flatMap(renderBlockText),
    ...(content.cta ? [`${content.cta.label}: ${content.cta.href}`, ""] : []),
    ...(content.secondary ? [`${content.secondary.label}: ${content.secondary.href}`, ""] : []),
    ...(content.footnote ? [content.footnote, ""] : []),
    "—",
    `Questions? Reply to this email or write to ${SUPPORT_EMAIL}.`,
    `Billing: ${site}/dashboard/billing`,
    content.reason ?? "You're receiving this because you have a ReelSpy account.",
    ...(content.unsubscribeUrl ? [`Unsubscribe: ${content.unsubscribeUrl}`] : []),
    `© ${year} ReelSpy · Dubai, United Arab Emirates`,
  ];

  // Collapse the runs of blank lines the block builders leave behind.
  const text = textLines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { html, text };
}
