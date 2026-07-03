-- Auto-Reply: remove the comment-like feature entirely.
--
-- Liking matched comments was step 1 of the pipeline, but Meta's Facebook-Login
-- Graph path never actually exposed the comment-like edge (every attempt
-- returned GraphMethodException 100/33), so the step was permanently "skipped"
-- and only added noise to the Activity log. The pipeline is now public reply →
-- DM only. Drop the per-event tracking columns.

alter table automation_events
  drop column if exists like_status,
  drop column if exists like_error;
