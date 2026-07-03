-- Remove the viral-pattern tagging feature. Drops the AI-detected pattern
-- columns from tracked_reels and the pattern column from generated_scripts.
-- Idempotent.

alter table tracked_reels
  drop column if exists viral_pattern,
  drop column if exists pattern_checked_at;

alter table generated_scripts
  drop column if exists viral_pattern;
