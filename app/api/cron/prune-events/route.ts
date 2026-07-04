import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cronAuthorized } from "@/lib/utils/cron";
import { pruneEventLogs } from "@/lib/analytics/retention";

// Event-log retention (roadmap V7). Deletes aged rows from the append-only
// event/telemetry tables (app_events, ai_usage, automation_events) past the
// data-minimization window, plus terminal jobs, so we don't retain user +
// third-party data indefinitely (PDPL). Triggered weekly by
// .github/workflows/prune-events.yml — Vercel Hobby's 2 daily cron slots are
// spent (refresh-snapshots/refresh-tokens), so this rides GitHub Actions like
// weekly-digest/run-jobs. Auth via CRON_SECRET (see lib/utils/cron.ts).
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const result = await pruneEventLogs(admin);

  // Surface a partial failure without failing the whole run: if some table
  // errored, report 207 so the workflow log flags it while the rest still ran.
  const hadError = Object.keys(result.errors).length > 0;
  return NextResponse.json({ ok: !hadError, ...result }, { status: hadError ? 207 : 200 });
}
