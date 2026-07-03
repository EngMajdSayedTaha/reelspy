-- Store the timed subtitle (.srt) form of a reel transcript alongside the
-- plain text, so users can download captions that match the audio timing.
-- Additive and idempotent — safe to run on an existing database.

alter table tracked_reels
  add column if not exists transcript_srt text;

-- Existing RLS policy "Users can manage own reels" already covers this column,
-- so no new policy is required.
