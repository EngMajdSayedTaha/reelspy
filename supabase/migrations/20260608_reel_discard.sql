-- Discarded reels: let users hide reels they don't want to see again, with the
-- ability to filter/restore them. Additive + idempotent.

alter table tracked_reels
  add column if not exists is_discarded boolean default false,
  add column if not exists discarded_at timestamptz;
