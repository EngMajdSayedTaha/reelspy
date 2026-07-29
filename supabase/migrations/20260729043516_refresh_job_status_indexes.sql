-- Indexes for the stranded-job self-heal scan (app/api/cron/refresh-snapshots/
-- route.ts `requeueStrandedRefreshJobs`), which looks up all refresh_snapshot
-- jobs sitting in `failed` and cross-references active jobs by dedup key. The
-- existing `jobs_due_idx` only covers (status, run_at) for queued/running rows,
-- so a `failed`-status scan fell back to a seq scan over the whole jobs table.
--
-- Deliberately kept narrow: only refresh_snapshot rows, only the statuses that
-- scan actually asks for.
create index if not exists jobs_refresh_status_idx
  on jobs (kind, status, run_at)
  where kind = 'refresh_snapshot' and status in ('queued', 'running', 'failed');

-- Maps a failed job back to its username to check for an already-active job
-- with the same dedup key. `jobs_dedup_active_idx` is unique-partial over
-- queued/running only, so it can't serve a lookup against the failed rows.
create index if not exists jobs_refresh_dedup_key_idx
  on jobs (dedup_key)
  where kind = 'refresh_snapshot' and dedup_key is not null;
