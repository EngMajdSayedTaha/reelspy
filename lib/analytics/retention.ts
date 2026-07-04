// Event-log retention (roadmap V7; extends H6's data-minimization note). Prunes
// aged rows from the append-only event/telemetry tables so we don't retain
// user + third-party data (e.g. `automation_events.comment_text`) indefinitely,
// per PDPL data minimization. Run weekly by /api/cron/prune-events.
//
// Service-role only — `app_events`/`ai_usage`/`jobs` have RLS on with no
// policies, and we delete third-party content from `automation_events`. Always
// pass an admin (service-role) client.
//
// Cadence note: this app's oldest data is only months old, so at a 365-day
// window this is a no-op until ~mid-2027; running it weekly from now keeps the
// eventual delete set to a single week's worth of expired rows (never a giant
// backlog), so a plain per-table delete is safe.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { numEnv } from "@/lib/utils/env";

// Tables pruned on the long (data-minimization) window, all keyed on created_at.
const EVENT_TABLES = ["app_events", "ai_usage", "automation_events"] as const;

export type PruneResult = {
  eventRetentionDays: number;
  jobsRetentionDays: number;
  cutoffs: { events: string; jobs: string };
  deleted: Record<string, number>;
  errors: Record<string, string>;
};

function cutoffIso(days: number, now = Date.now()): string {
  return new Date(now - days * 86_400_000).toISOString();
}

// Delete rows older than the retention windows. Each table is pruned
// independently (its own try/catch) so one failure doesn't block the rest;
// per-table counts and errors come back in the result. `count: "exact"` returns
// the number deleted without pulling the row payloads back.
export async function pruneEventLogs(
  admin: SupabaseClient,
  now = Date.now()
): Promise<PruneResult> {
  const eventRetentionDays = numEnv("EVENT_RETENTION_DAYS", 365);
  const jobsRetentionDays = numEnv("JOBS_RETENTION_DAYS", 30);
  const eventsCutoff = cutoffIso(eventRetentionDays, now);
  const jobsCutoff = cutoffIso(jobsRetentionDays, now);

  const deleted: Record<string, number> = {};
  const errors: Record<string, string> = {};

  for (const table of EVENT_TABLES) {
    try {
      const { count, error } = await admin
        .from(table)
        .delete({ count: "exact" })
        .lt("created_at", eventsCutoff);
      if (error) throw new Error(error.message);
      deleted[table] = count ?? 0;
    } catch (err) {
      errors[table] = err instanceof Error ? err.message : String(err);
    }
  }

  // Terminal jobs only — never touch queued/running rows (the worker owns
  // those). These are pure operational noise once done/failed, so a shorter
  // window keeps the queue table small.
  try {
    const { count, error } = await admin
      .from("jobs")
      .delete({ count: "exact" })
      .in("status", ["done", "failed"])
      .lt("created_at", jobsCutoff);
    if (error) throw new Error(error.message);
    deleted.jobs = count ?? 0;
  } catch (err) {
    errors.jobs = err instanceof Error ? err.message : String(err);
  }

  return {
    eventRetentionDays,
    jobsRetentionDays,
    cutoffs: { events: eventsCutoff, jobs: jobsCutoff },
    deleted,
    errors,
  };
}
