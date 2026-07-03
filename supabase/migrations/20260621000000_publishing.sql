-- Multi-platform Publishing module: upload one video, cross-post it to
-- Instagram Reels, Facebook Pages, TikTok, and YouTube — now or on a schedule.
--
-- Shape:
--   social_connections  one row per connected platform account (OAuth tokens)
--   publish_posts       the upload + shared caption (the "what")
--   publish_jobs        one row per (post × platform) target (the "where")
--
-- Security mirrors the Instagram token lockdown (20260611_lock_down_ig_tokens.sql):
-- OAuth access/refresh tokens are the crown jewels, so the columns holding them
-- are revoked from browser roles and only ever read/written by the service-role
-- client (lib/publishing/token-store.ts). The browser sees connection METADATA
-- only (platform, handle, status, expiry) — never a token.

-- ── social_connections ───────────────────────────────────────────────────────

create table if not exists social_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  platform text not null check (platform in ('instagram', 'facebook', 'tiktok', 'youtube')),
  -- Remote account identity (ig user id / page id / tiktok open id / yt channel id).
  account_id text not null,
  account_name text,
  account_username text,
  avatar_url text,
  -- Credentials — SERVER ONLY (revoked from authenticated below).
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  token_status text not null default 'active',  -- active | expired | invalid
  scopes text,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, platform, account_id)
);

alter table social_connections enable row level security;

create policy "Users can read own connections"
  on social_connections for select
  using (auth.uid() = user_id);

create policy "Users can update own connections"
  on social_connections for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own connections"
  on social_connections for delete
  using (auth.uid() = user_id);

create index if not exists social_connections_user_platform_idx
  on social_connections (user_id, platform);

-- Browser roles: metadata only, never the token columns. Inserts/updates of
-- token columns go through the service-role client, which bypasses these grants.
revoke all on table social_connections from anon;
revoke all on table social_connections from authenticated;
grant select (id, user_id, platform, account_id, account_name, account_username,
              avatar_url, token_status, token_expires_at, scopes, is_active,
              created_at, updated_at)
  on social_connections to authenticated;
grant update (is_active) on social_connections to authenticated;
grant delete on table social_connections to authenticated;

-- ── publish_posts ────────────────────────────────────────────────────────────

create table if not exists publish_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  title text,
  caption text,
  hashtags text,
  -- Object path inside the private `publish-media` Storage bucket. Signed URLs
  -- are minted at publish time, never stored.
  video_path text not null,
  thumbnail_path text,
  duration_seconds int,
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'publishing', 'done', 'failed')),
  scheduled_at timestamptz,   -- null = publish immediately
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table publish_posts enable row level security;

create policy "Users can manage own posts"
  on publish_posts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists publish_posts_user_created_idx
  on publish_posts (user_id, created_at desc);
-- Cron worker scans for due scheduled posts.
create index if not exists publish_posts_due_idx
  on publish_posts (status, scheduled_at);

-- ── publish_jobs ─────────────────────────────────────────────────────────────
-- One per platform target. The (post_id, connection_id) unique constraint is the
-- idempotency lock: a webhook/cron retry can never double-post to the same
-- account (cf. automation_events.comment_id in the Auto-Reply module).

create table if not exists publish_jobs (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references publish_posts(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  connection_id uuid references social_connections(id) on delete set null,
  platform text not null check (platform in ('instagram', 'facebook', 'tiktok', 'youtube')),
  privacy text not null default 'public',  -- public | private (SELF_ONLY pre-audit)
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'published', 'failed')),
  remote_id text,        -- returned media/video id
  remote_url text,       -- public permalink, when the platform returns one
  error_message text,
  attempts int not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (post_id, connection_id)
);

alter table publish_jobs enable row level security;

create policy "Users can read own jobs"
  on publish_jobs for select
  using (auth.uid() = user_id);

create index if not exists publish_jobs_post_idx on publish_jobs (post_id);

-- ── Storage: private bucket for uploaded videos ──────────────────────────────
-- Objects live under `{user_id}/...`; RLS keys off the first path segment so a
-- user can only read/write their own uploads.

insert into storage.buckets (id, name, public)
  values ('publish-media', 'publish-media', false)
  on conflict (id) do nothing;

create policy "Users manage own publish-media objects"
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'publish-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'publish-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
