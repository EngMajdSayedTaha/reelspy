-- Auto viral-pattern tagging: store an AI-detected pattern per reel and track
-- which reels have been classified. Additive + idempotent.

alter table tracked_reels
  add column if not exists viral_pattern text,
  add column if not exists pattern_checked_at timestamptz;
