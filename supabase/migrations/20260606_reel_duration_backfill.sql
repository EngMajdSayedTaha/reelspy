-- Track duration backfill attempts so reels are probed at most once by the
-- batched backfill job (yt-dlp metadata). Additive and idempotent.

alter table tracked_reels
  add column if not exists duration_checked_at timestamptz;
