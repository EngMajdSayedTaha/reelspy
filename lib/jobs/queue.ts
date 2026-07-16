// Durable job queue (H1 / roadmap V4). A thin typed wrapper over the `jobs`
// table + `claim_jobs` RPC. Producers call `enqueueJob`; the cron worker
// (`/api/cron/run-jobs`) calls `claimJobs` then `completeJob` / `failJob`.
//
// Service-role only — the table has RLS on with no policies and `claim_jobs` is
// granted to service_role. Always pass an admin (service-role) client.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { numEnv } from "@/lib/utils/env";

export type JobKind = "publish_post" | "transcribe_reel" | "send_digest" | "refresh_snapshot";

export type Job = {
  id: string;
  kind: JobKind;
  payload: Record<string, unknown>;
  user_id: string | null;
  run_at: string;
  attempts: number;
  max_attempts: number;
  locked_at: string | null;
  locked_by: string | null;
  status: "queued" | "running" | "done" | "failed";
  last_error: string | null;
  dedup_key: string | null;
  created_at: string;
  updated_at: string;
};

type EnqueueInput = {
  kind: JobKind;
  payload?: Record<string, unknown>;
  userId?: string | null;
  // When to first run; default now. Accepts a Date or ISO string.
  runAt?: Date | string;
  maxAttempts?: number;
  // Idempotency key. A second active (queued/running) job with the same key is
  // silently skipped, so producers can enqueue-or-update without double work.
  dedupKey?: string;
};

function toIso(v: Date | string | undefined): string | undefined {
  if (v == null) return undefined;
  return typeof v === "string" ? v : v.toISOString();
}

// Enqueue a job. If a dedupKey is given and an active job already holds it, this
// is a no-op (returns { skipped: true }) — the partial unique index is the hard
// guarantee, so a lost race surfaces as a 23505 we swallow.
export async function enqueueJob(
  admin: SupabaseClient,
  input: EnqueueInput
): Promise<{ id: string | null; skipped: boolean }> {
  const row: Record<string, unknown> = {
    kind: input.kind,
    payload: input.payload ?? {},
    user_id: input.userId ?? null,
    dedup_key: input.dedupKey ?? null,
  };
  const runAt = toIso(input.runAt);
  if (runAt) row.run_at = runAt;
  if (input.maxAttempts != null) row.max_attempts = input.maxAttempts;

  const { data, error } = await admin
    .from("jobs")
    .insert(row)
    .select("id")
    .maybeSingle();

  if (error) {
    // Unique violation on the active-dedup index → an equivalent job is already
    // queued/running. Treat as success (nothing to do).
    if (error.code === "23505") return { id: null, skipped: true };
    throw new Error(`enqueueJob(${input.kind}) failed: ${error.message}`);
  }
  return { id: (data as { id: string } | null)?.id ?? null, skipped: false };
}

// Atomically claim up to `limit` due jobs of the given kinds for this worker.
export async function claimJobs(
  admin: SupabaseClient,
  worker: string,
  kinds: JobKind[],
  limit: number
): Promise<Job[]> {
  const { data, error } = await admin.rpc("claim_jobs", {
    p_worker: worker,
    p_kinds: kinds,
    p_limit: limit,
    p_lock_timeout_seconds: numEnv("JOBS_LOCK_TIMEOUT_SECONDS", 600),
  });
  if (error) throw new Error(`claim_jobs failed: ${error.message}`);
  return (data ?? []) as Job[];
}

export async function completeJob(admin: SupabaseClient, id: string): Promise<void> {
  await admin
    .from("jobs")
    .update({ status: "done", last_error: null, updated_at: new Date().toISOString() })
    .eq("id", id);
}

// Exponential backoff with a cap. `attempts` is already incremented at claim
// time, so the first failure (attempts=1) waits base, the next 2×base, etc.
export function backoffMs(attempts: number): number {
  const base = numEnv("JOBS_BACKOFF_BASE_MS", 60_000);
  const cap = numEnv("JOBS_BACKOFF_CAP_MS", 3_600_000);
  return Math.min(cap, base * 2 ** Math.max(0, attempts - 1));
}

// Failure handling: reschedule with backoff until max_attempts is spent, then
// park the job as `failed`. The row is locked to this worker (claimed), so a
// plain update is safe — no contention.
export async function failJob(
  admin: SupabaseClient,
  job: Pick<Job, "id" | "attempts" | "max_attempts">,
  error: unknown
): Promise<{ retried: boolean }> {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
  const exhausted = job.attempts >= job.max_attempts;
  if (exhausted) {
    await admin
      .from("jobs")
      .update({ status: "failed", last_error: message, updated_at: new Date().toISOString() })
      .eq("id", job.id);
    return { retried: false };
  }
  const runAt = new Date(Date.now() + backoffMs(job.attempts)).toISOString();
  await admin
    .from("jobs")
    .update({
      status: "queued",
      last_error: message,
      run_at: runAt,
      locked_at: null,
      locked_by: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id);
  return { retried: true };
}
