import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cronAuthorized } from "@/lib/utils/cron";
import { emailConfigured } from "@/lib/email/send";
import { enqueueJob } from "@/lib/jobs/queue";
import { numEnv } from "@/lib/utils/env";

// Weekly niche digest (V3/W6) — now a producer for the durable queue (V4).
// Triggered by .github/workflows/weekly-digest.yml (Mondays 08:00 UTC). This
// fans out one `send_digest` job per opted-in user; the cron worker
// (/api/cron/run-jobs) builds + sends each digest with retries, so a slow/failed
// send for one user no longer blocks or drops the rest. Dedup on the ISO week so
// re-triggering the workflow won't double-send.
export const runtime = "nodejs";
export const maxDuration = 60;

// ISO-ish week stamp (YYYY-Www) for the dedup key, so one digest per user/week.
function weekStamp(d = new Date()): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!emailConfigured()) {
    // No mailer wired yet — succeed as a no-op so the schedule doesn't error.
    return NextResponse.json({ ok: true, skipped: "email_not_configured" });
  }

  const admin = createAdminClient();
  const batch = numEnv("DIGEST_BATCH", 500);
  const week = weekStamp();

  const { data: profiles, error } = await admin
    .from("profiles")
    .select("id")
    .eq("digest_opt_out", false)
    .limit(batch)
    .returns<{ id: string }[]>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let queued = 0;
  let skipped = 0;
  for (const profile of profiles ?? []) {
    const { skipped: dup } = await enqueueJob(admin, {
      kind: "send_digest",
      payload: { user_id: profile.id },
      userId: profile.id,
      // Digests can wait; cap retries lower than the default so a persistently
      // failing user doesn't retry all week.
      maxAttempts: 3,
      dedupKey: `digest:${week}:${profile.id}`,
    });
    if (dup) skipped++;
    else queued++;
  }

  return NextResponse.json({ ok: true, week, queued, skipped });
}
