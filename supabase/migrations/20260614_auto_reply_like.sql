-- Auto-Reply: like (heart) the matching comment before replying.
--
-- The like runs as step 1 of the pipeline (like → public reply → DM) and is
-- best-effort: a failure never blocks the reply or the DM. Status is tracked
-- per event so the dashboard shows whether Meta accepted the like.

alter table automation_events
  add column if not exists like_status text not null default 'pending',  -- pending | sent | failed | skipped
  add column if not exists like_error text;
