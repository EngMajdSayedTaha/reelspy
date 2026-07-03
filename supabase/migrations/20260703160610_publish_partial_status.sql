-- L9 (B4): honest `partial` post status.
-- When a post fans out to several platforms and some succeed while others fail,
-- the dispatcher used to mark the post `done` — hiding the failure. Add a
-- `partial` value so the post row tells the truth (some targets failed, retry
-- the failed jobs). Backward-compatible: widens the CHECK, no data rewrite.

alter table publish_posts drop constraint if exists publish_posts_status_check;
alter table publish_posts add constraint publish_posts_status_check
  check (status in ('draft', 'scheduled', 'publishing', 'done', 'partial', 'failed'));
