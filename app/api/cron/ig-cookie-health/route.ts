import { NextResponse } from "next/server";
import { emailConfigured, sendEmail } from "@/lib/email/send";
import { buildEmail } from "@/lib/email/layout";
import { claimAlertSlot, getIgCookieStatus } from "@/lib/media/ig-cookies";
import { getReelMetadata } from "@/lib/media/ytdlp";
import { classifyYtDlpError } from "@/lib/media/ytdlp-errors";
import { cronAuthorized } from "@/lib/utils/cron";

// Daily watchdog for the Instagram cookie session (GitHub Actions
// .github/workflows/ig-cookie-health.yml — Vercel Hobby's two cron slots are
// taken). Runs one cookie-AUTHENTICATED extraction against a known public reel:
//
//   * Success proves the session works from Vercel's egress IPs, and — because
//     getReelMetadata persists the jar yt-dlp rewrites — captures Instagram's
//     session rotation every day even with zero user traffic. This daily
//     touch is what keeps the stored session alive long-term.
//   * Failure emails ADMIN_ALERT_EMAIL (throttled to one per ~day) and returns
//     500 so the Actions run goes red — GitHub's own failure notification is
//     the free backup channel when Resend isn't configured.
export const runtime = "nodejs";
export const maxDuration = 120;

const ALERT_THROTTLE_MS = 20 * 60 * 60 * 1000; // <24h so a daily cron can always re-alert

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = process.env.IG_HEALTHCHECK_REEL_URL?.trim();
  if (!url) {
    return NextResponse.json({
      status: "skipped",
      reason: "IG_HEALTHCHECK_REEL_URL is not set — pick a stable public reel (e.g. your own).",
    });
  }

  const before = await getIgCookieStatus();

  try {
    const metadata = await getReelMetadata(url, { cookieMode: "require" });
    const after = await getIgCookieStatus();
    return NextResponse.json({
      status: "ok",
      source: before.source,
      mediaResolved: Boolean(metadata.mediaUrl),
      lastOkAt: after.lastOkAt,
      rotations: after.rotations,
      cookieAgeDays: after.updatedAt
        ? Math.floor((Date.now() - Date.parse(after.updatedAt)) / 86_400_000)
        : null,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "extraction failed";
    const kind = classifyYtDlpError(detail);

    let alerted = false;
    const to = process.env.ADMIN_ALERT_EMAIL?.trim();
    if (to && emailConfigured() && (await claimAlertSlot(ALERT_THROTTLE_MS))) {
      const ageDays = before.updatedAt
        ? Math.floor((Date.now() - Date.parse(before.updatedAt)) / 86_400_000)
        : null;
      const { html, text } = buildEmail({
        eyebrow: "Internal alert",
        preheader: `The daily Instagram cookie health check failed (${kind}).`,
        title: `Instagram cookie health check failed`,
        blocks: [
          {
            kind: "paragraph",
            text: "The daily authenticated extraction against the health-check reel did not succeed. Until the session is restored, cookie-gated Instagram features degrade to the public-only path.",
          },
          {
            kind: "rows",
            caption: "Check result",
            rows: [
              { label: "Failure kind", value: kind, emphasis: true },
              { label: "Cookie source", value: before.source ?? "none configured" },
              { label: "Cookie age", value: ageDays === null ? "unknown" : `${ageDays} day(s)` },
              { label: "Last successful run", value: before.lastOkAt ?? "never" },
            ],
          },
          { kind: "heading", text: "Error" },
          { kind: "paragraph", text: detail.slice(0, 400) },
          {
            kind: "bullets",
            caption: "How to fix",
            items: [
              "Export fresh cookies from the dedicated Instagram account.",
              "Run: node scripts/update-ig-cookies.mjs <cookies.txt> --url <app-url>",
              "Full procedure: docs/ig-cookies-runbook.md",
            ],
          },
        ],
        reason: "Internal ReelSpy infrastructure alert.",
      });
      alerted = await sendEmail({
        to,
        subject: `[ReelSpy] Instagram cookie health check failed (${kind})`,
        html,
        text,
      });
    }

    // 500 on purpose: the GitHub Actions run goes red and GitHub notifies the
    // repo owner even when Resend is unconfigured.
    return NextResponse.json(
      { status: "failed", kind, error: detail.slice(0, 400), alerted },
      { status: 500 }
    );
  }
}
