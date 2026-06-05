-- Reel transcripts: store the spoken transcript of a tracked reel for display.
-- Additive and idempotent — safe to run on an existing database.

alter table tracked_reels
  add column if not exists transcript text,
  add column if not exists transcript_lang text,
  add column if not exists transcript_source text,
  add column if not exists transcript_status text default 'none',
  add column if not exists transcript_generated_at timestamptz;

-- Existing RLS policy "Users can manage own reels" already covers these columns,
-- so no new policy is required.
