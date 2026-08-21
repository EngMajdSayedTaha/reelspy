import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { flushDigest } from "@/lib/notifications/alerts";
import { cronAuthorized } from "@/lib/utils/cron";

// The alert digest flush (.github/workflows/admin-digest.yml — Vercel Hobby's
// cron slots are spoken for).
//
// Runs HOURLY and does nothing most of the time: `flushDigest` reads the
// admin's configured interval and returns `too_soon` until it has elapsed. That
// split is deliberate — the cadence belongs to the founder in
// Admin → Notifications, not to a cron expression that needs a deploy and a
// GitHub Actions edit to change.
//
// Always 200, even when there's nothing to do: a red Actions run should mean
// "alerting is broken", so an idle hour must not spend that signal.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await flushDigest(createAdminClient());
    return NextResponse.json(result);
  } catch (err) {
    // A failure here means the founder stops receiving batched alerts, which is
    // exactly the kind of silent outage this feature exists to prevent — so
    // this one DOES go red.
    const message = err instanceof Error ? err.message : "digest flush failed";
    console.error("[cron/admin-digest]", message);
    return NextResponse.json({ status: "error", error: message.slice(0, 300) }, { status: 500 });
  }
}
