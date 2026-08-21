import { NextResponse } from "next/server";
import { getIgCookieStatus } from "@/lib/media/ig-cookies";
import { getReelMetadata } from "@/lib/media/ytdlp";
import { classifyYtDlpError } from "@/lib/media/ytdlp-errors";
import { cronAuthorized } from "@/lib/utils/cron";
import { notifyIntegrationUnhealthy } from "@/lib/notifications/cron";

// Daily watchdog for the Instagram cookie session (GitHub Actions
// .github/workflows/ig-cookie-health.yml — Vercel Hobby's two cron slots are
// taken). Runs one cookie-AUTHENTICATED extraction against a known public reel:
//
//   * Success proves the session works from Vercel's egress IPs, and — because
//     getReelMetadata persists the jar yt-dlp rewrites — captures Instagram's
//     session rotation every day even with zero user traffic. This daily
//     touch is what keeps the stored session alive long-term.
//   * Failure raises an `integration.unhealthy` alert (routed, throttled and
//     logged by lib/notifications — see /admin/notifications) and returns 500 so
//     the Actions run goes red: GitHub's own failure notification is the free
//     backup channel when no mailer is configured.
export const runtime = "nodejs";
export const maxDuration = 120;

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

    const ageDays = before.updatedAt
      ? Math.floor((Date.now() - Date.parse(before.updatedAt)) / 86_400_000)
      : null;

    // Routing, recipients, throttling and the log all live in one place now —
    // this route just says what broke. The catalog throttles this event to one
    // alert per 12h, which replaces the hand-rolled `claimAlertSlot` window.
    await notifyIntegrationUnhealthy("Instagram cookies", {
      summary: `The daily authenticated extraction failed (${kind}). Until the session is restored, cookie-gated Instagram features degrade to the public-only path. Fix: export fresh cookies and run scripts/update-ig-cookies.mjs — see docs/ig-cookies-runbook.md.`,
      context: {
        "Failure kind": kind,
        "Cookie source": before.source ?? "none configured",
        "Cookie age": ageDays === null ? "unknown" : `${ageDays} day(s)`,
        "Last success": before.lastOkAt ?? "never",
        Error: detail.slice(0, 200),
      },
      link: "/admin/ops",
    });

    // 500 on purpose: the GitHub Actions run goes red and GitHub notifies the
    // repo owner even when Resend is unconfigured.
    return NextResponse.json(
      { status: "failed", kind, error: detail.slice(0, 400), alerted: true },
      { status: 500 }
    );
  }
}
