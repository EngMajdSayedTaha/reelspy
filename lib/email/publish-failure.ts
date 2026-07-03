// Publish-failure summary email (L9 / B4). Composes a per-platform failure
// digest and sends it via `sendEmail`. Server-only, fail-open — a broken or
// unconfigured notification must never affect the publish result.

import "server-only";
import { sendEmail } from "./send";
import { PLATFORM_LABELS, type Platform } from "@/lib/publishing/types";

export type FailedTarget = {
  platform: Platform;
  error: string;
};

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://reelspy-one.vercel.app").replace(
    /\/+$/,
    ""
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Sends one summary email when a post finishes with at least one failed target.
// `published` is the count of targets that succeeded (so the copy can say
// "partial" vs "all failed"). Returns whether the email was accepted.
export async function notifyPublishFailure(params: {
  to: string;
  postTitle: string;
  published: number;
  failed: FailedTarget[];
}): Promise<boolean> {
  const { to, postTitle, published, failed } = params;
  if (failed.length === 0) return false;

  const deepLink = `${siteUrl()}/dashboard/publishing`;
  const partial = published > 0;
  const heading = partial
    ? `Your post published to ${published} platform${published === 1 ? "" : "s"}, but ${failed.length} failed`
    : `Your post couldn't be published`;

  const rowsHtml = failed
    .map(
      (f) =>
        `<li style="margin-bottom:8px"><strong>${escapeHtml(PLATFORM_LABELS[f.platform])}</strong>: ${escapeHtml(f.error)}</li>`
    )
    .join("");

  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0F172A;max-width:520px;margin:0 auto">
    <h2 style="font-size:18px;margin:0 0 12px">${escapeHtml(heading)}</h2>
    <p style="font-size:14px;color:#475569;margin:0 0 16px">
      Post: <strong>${escapeHtml(postTitle)}</strong>
    </p>
    <ul style="font-size:14px;color:#0F172A;padding-left:18px;margin:0 0 20px">${rowsHtml}</ul>
    <a href="${deepLink}"
       style="display:inline-block;background:#6D28D9;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600">
      Review &amp; retry
    </a>
    <p style="font-size:12px;color:#94A3B8;margin:20px 0 0">
      Retrying a failed platform re-runs only that target — successful posts are never duplicated.
    </p>
  </div>`;

  const textLines = [
    heading,
    "",
    `Post: ${postTitle}`,
    "",
    ...failed.map((f) => `- ${PLATFORM_LABELS[f.platform]}: ${f.error}`),
    "",
    `Review & retry: ${deepLink}`,
  ];

  return sendEmail({
    to,
    subject: partial ? `Partial publish — ${failed.length} platform(s) failed` : `Publish failed`,
    html,
    text: textLines.join("\n"),
  });
}
