-- Video for the public reel wall on reelspy.dev.
--
-- The marketing site's "live trends" band renders a still for every reel
-- because a still is the only media that exists: this table has carried
-- thumbnail_url and nothing else, so the landing page had nothing to play.
-- Business Discovery already returns `media_url` (the mp4) alongside
-- `thumbnail_url` for VIDEO media, and we already request the field — it was
-- simply dropped at the mapping layer.
--
-- Same two-stage lifecycle as thumbnail_url:
--   1. the sync writes Instagram's signed CDN URL here, which is free but
--      expires in about a week;
--   2. a mirror pass copies the bytes into the public `ig-media` bucket and
--      rewrites this column to the permanent URL.
-- The public endpoint only ever emits a self-hosted value (isSelfHosted), so
-- a URL still in stage 1 never reaches a cached marketing page where it would
-- rot into a dead <video>.
alter table public.ig_reel_snapshots
  add column if not exists video_url text;

comment on column public.ig_reel_snapshots.video_url is
  'Reel mp4. Instagram''s signed media_url until mirrored, then a permanent ig-media Storage URL. Only self-hosted values are published publicly.';

-- Drives the mirror pass, which asks exactly one question: which recent reels
-- still have a video we have not self-hosted yet? Partial, because rows with
-- no video_url at all are the overwhelming majority and are not candidates.
create index if not exists ig_reel_snapshots_unmirrored_video_idx
  on public.ig_reel_snapshots (posted_at desc)
  where video_url is not null
    and video_url not like '%/storage/v1/object/public/ig-media/%';
