-- Make the viral_score robust and the hot query paths fast.
--
-- 1) NULL-safe score. viral_score is a STORED generated column; Postgres can't
--    alter a generation expression in place, so we drop and re-add it. The old
--    expression produced NULL whenever any of view/like/comment_count was NULL
--    (SQL NULL arithmetic), which made those reels vanish from sort/filter.
--    coalesce(...,0) keeps partially-synced reels rankable.
--
-- 2) Indexes. The feed sorts/filters tracked_reels by (user_id, viral_score) and
--    (user_id, posted_at); the auto-reply processor looks reels up by ig_media_id;
--    sync filters inspiration_accounts by (user_id, is_active). None were indexed,
--    so these were sequential scans that degrade as the tables grow.

-- ── 1) NULL-safe generated score ────────────────────────────────────────────
alter table tracked_reels drop column if exists viral_score;

alter table tracked_reels
  add column viral_score numeric generated always as (
    (coalesce(like_count, 0) * 1.0)
    + (coalesce(comment_count, 0) * 3.0)
    + (coalesce(view_count, 0) * 0.01)
  ) stored;

-- ── 2) Hot-path indexes ─────────────────────────────────────────────────────
create index if not exists tracked_reels_user_viral_idx
  on tracked_reels (user_id, viral_score desc);

create index if not exists tracked_reels_user_posted_idx
  on tracked_reels (user_id, posted_at desc);

create index if not exists inspiration_accounts_user_active_idx
  on inspiration_accounts (user_id, is_active);

-- Composite unique (user_id, ig_media_id) can't serve a lookup keyed on
-- ig_media_id alone (leading column is user_id), which is how the comment
-- processor matches incoming events to automations.
create index if not exists reel_automations_media_idx
  on reel_automations (ig_media_id);
