-- Durable job queue (H1 / roadmap V4). Replaces the inline/`after()` background
-- work (scheduled publishing, post-sync auto-transcribe, weekly digest fan-out)
-- with a `jobs` table worked by a minutely cron. Same atomic-claim discipline as
-- consume_user_action / consume_meta_quota: a SECURITY DEFINER RPC selects due
-- rows `for update skip locked` so overlapping workers never grab the same job.
-- Webhook comment processing stays on `after()` (latency-sensitive, already
-- idempotent) — the poll-comments cron remains its retry net.
--
-- Service-role only: RLS on with no policies, execute granted to service_role.

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null,                     -- 'publish_post' | 'transcribe_reel' | 'send_digest'
  payload jsonb not null default '{}',
  -- Attribution + cascade cleanup when a user is deleted. Nullable for future
  -- system jobs with no owner.
  user_id uuid references profiles(id) on delete cascade,
  run_at timestamptz not null default now(),
  attempts int not null default 0,
  max_attempts int not null default 5,
  locked_at timestamptz,
  locked_by text,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'done', 'failed')),
  last_error text,
  -- Optional idempotency key; a partial unique index (below) stops a second
  -- ACTIVE job with the same key being enqueued while one is still in flight,
  -- but allows re-enqueue once the prior one is done/failed.
  dedup_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table jobs enable row level security;  -- no policies: service-role only

-- Claim scan: due queued rows first, then reclaim stale-locked runners.
create index if not exists jobs_due_idx on jobs (status, run_at)
  where status in ('queued', 'running');
-- Enforce single-in-flight per dedup_key.
create unique index if not exists jobs_dedup_active_idx on jobs (dedup_key)
  where dedup_key is not null and status in ('queued', 'running');

-- Atomically claim up to p_limit due jobs of the given kinds for one worker.
-- Picks queued jobs whose run_at has arrived, PLUS running jobs whose lock has
-- gone stale (crashed worker) past p_lock_timeout_seconds. Bumps `attempts` on
-- claim so a job that keeps crashing mid-run still converges on max_attempts.
-- `for update skip locked` lets concurrent cron invocations claim disjoint sets.
create or replace function claim_jobs(
  p_worker text,
  p_kinds text[],
  p_limit int,
  p_lock_timeout_seconds int default 600
) returns setof jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update jobs j
    set status = 'running',
        locked_at = now(),
        locked_by = p_worker,
        attempts = j.attempts + 1,
        updated_at = now()
  where j.id in (
    select id from jobs c
    where c.kind = any(p_kinds)
      and (
        (c.status = 'queued' and c.run_at <= now())
        or (
          c.status = 'running'
          and c.locked_at < now() - make_interval(secs => p_lock_timeout_seconds)
        )
      )
    order by c.run_at
    for update skip locked
    limit greatest(1, p_limit)
  )
  returning j.*;
end;
$$;

revoke all on function claim_jobs(text, text[], int, int) from public, anon, authenticated;
grant execute on function claim_jobs(text, text[], int, int) to service_role;
