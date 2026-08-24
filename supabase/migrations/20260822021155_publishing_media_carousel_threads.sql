-- Publishing: photos, carousels, and Threads.
--
-- Until now a publish_post was exactly one video (`publish_posts.video_path`,
-- NOT NULL). Every platform we post to also accepts single images and
-- multi-item carousels — Instagram (up to 10 children), Threads (2–20), TikTok
-- photo mode (up to 35), Facebook multi-photo via attached_media — so the media
-- model becomes a list instead of a column.
--
-- Shape:
--   publish_media   one row per slide, ordered by `position` (the new truth)
--   publish_posts   gains media_kind / cover_index / cover_ms; video_path stays
--                   populated for old rows and becomes nullable for new ones
--
-- Also here, because they are the same blast radius:
--   * 'threads' added to the platform CHECKs on social_connections + publish_jobs
--     (the CHECK is the reason a platform can't be added in application code alone)
--   * the idempotency lock on publish_jobs is repaired — see below

-- ── publish_media ────────────────────────────────────────────────────────────
-- `storage_path` is a Cloudflare R2 object key, same namespace as
-- publish_posts.video_path ({user_id}/{uuid}.{ext}); signed at publish time by
-- lib/storage/r2.ts, never stored as a URL.

create table if not exists publish_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references publish_posts(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  -- 0-based slide order. Slide 0 is the one every platform uses as the single
  -- media when it doesn't support carousels.
  position integer not null,
  kind text not null check (kind in ('image', 'video')),
  storage_path text not null,
  mime_type text not null,
  byte_size bigint,
  width integer,
  height integer,
  duration_seconds numeric,
  -- Accessible description. Instagram accepts it on single image posts
  -- (alt_text) and Facebook on photos (alt_text_custom).
  alt_text text,
  created_at timestamptz not null default now(),
  unique (post_id, position)
);

alter table publish_media enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'publish_media'
      and policyname = 'Users can manage own publish media'
  ) then
    create policy "Users can manage own publish media"
      on publish_media for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

create index if not exists publish_media_post_idx on publish_media (post_id, position);

-- ── publish_posts: media kind + cover ────────────────────────────────────────

alter table publish_posts
  add column if not exists media_kind text not null default 'video',
  add column if not exists cover_index integer not null default 0,
  add column if not exists cover_ms integer;

comment on column publish_posts.media_kind is
  'video | image | carousel — how the publish_media rows should be posted.';
comment on column publish_posts.cover_index is
  'Carousel slide used as the cover (TikTok photo_cover_index).';
comment on column publish_posts.cover_ms is
  'Video frame offset in ms used as the cover (Instagram thumb_offset).';

alter table publish_posts drop constraint if exists publish_posts_media_kind_check;
alter table publish_posts add constraint publish_posts_media_kind_check
  check (media_kind in ('video', 'image', 'carousel'));

-- An image-only post has no video. Kept as a real column (not dropped) so the
-- backfill below and any in-flight code path still resolve old posts.
alter table publish_posts alter column video_path drop not null;

-- Backfill: every existing post is a single video at position 0. Guarded by the
-- not-exists so a re-run can't duplicate slides.
insert into publish_media (post_id, user_id, position, kind, storage_path, mime_type, duration_seconds)
select p.id, p.user_id, 0, 'video', p.video_path, 'video/mp4', p.duration_seconds
from publish_posts p
where p.video_path is not null
  and not exists (select 1 from publish_media m where m.post_id = p.id);

-- ── Threads ──────────────────────────────────────────────────────────────────
-- Threads is its own Meta app product (Threads App ID/Secret, threads.net OAuth,
-- graph.threads.net) but stores exactly like TikTok/YouTube: one row in
-- social_connections holding the 60-day long-lived token.

alter table social_connections drop constraint if exists social_connections_platform_check;
alter table social_connections add constraint social_connections_platform_check
  check (platform in ('instagram', 'facebook', 'tiktok', 'youtube', 'threads'));

alter table publish_jobs drop constraint if exists publish_jobs_platform_check;
alter table publish_jobs add constraint publish_jobs_platform_check
  check (platform in ('instagram', 'facebook', 'tiktok', 'youtube', 'threads'));

-- ── Repair the idempotency lock ──────────────────────────────────────────────
-- 20260621000000_publishing.sql declared `unique (post_id, connection_id)` as
-- "never double-post a target". It never held for Instagram or Facebook: their
-- credentials live on `profiles`, so publish_jobs.connection_id is NULL for
-- both, and Postgres treats NULLs as distinct in a unique constraint. Two
-- Instagram jobs on one post were always insertable. (post_id, platform) is the
-- constraint that was meant all along and covers every platform.

-- Collapse any duplicate that the broken constraint already allowed, keeping the
-- most advanced job per (post, platform) so a published target is never dropped.
delete from publish_jobs
where id in (
  select id from (
    select id, row_number() over (
      partition by post_id, platform
      order by
        case status
          when 'published' then 3
          when 'processing' then 2
          when 'pending' then 1
          else 0
        end desc,
        created_at asc nulls last
    ) as rn
    from publish_jobs
  ) ranked
  where ranked.rn > 1
);

alter table publish_jobs drop constraint if exists publish_jobs_post_id_connection_id_key;
create unique index if not exists publish_jobs_post_platform_key
  on publish_jobs (post_id, platform);

-- Retry sweeps and the admin ops view scan jobs by owner/state; only (post_id)
-- was indexed.
create index if not exists publish_jobs_user_status_idx on publish_jobs (user_id, status);

comment on column publish_jobs.platform_options is
  'Per-platform composer choices. TikTok: {privacyLevel, postMode, brandedContent, brandOrganic, autoAddMusic}. Null when a platform has none.';
