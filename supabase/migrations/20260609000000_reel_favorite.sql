-- Favorited reels: let users mark reels they love and filter to them.
-- Additive + idempotent.

alter table tracked_reels
  add column if not exists is_favorite boolean default false,
  add column if not exists favorited_at timestamptz;
