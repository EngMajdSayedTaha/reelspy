-- YouTube comment auto-reply: link a YouTube video to keywords and post a
-- public reply whenever a matching top-level comment appears (the YouTube
-- analogue of reel_automations, comments-only — YouTube has no DMs).
--
-- YouTube has NO push webhooks for comments, so delivery is poll-based
-- (app/api/cron/poll-youtube-comments). Idempotency works exactly like the
-- Instagram side: youtube_automation_events.comment_id is UNIQUE, so a comment
-- is only ever replied to once even if polling overlaps a retry.
--
-- The connection (OAuth tokens) lives in social_connections (platform =
-- 'youtube'); connection_id references it so a disconnect/reconnect is visible.

create table if not exists youtube_automations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  connection_id uuid references social_connections(id) on delete set null,
  video_id text not null,
  video_title text,
  keywords text[] not null,
  match_mode text not null default 'contains' check (match_mode in ('contains', 'exact', 'any')),
  public_reply_templates text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, video_id)
);

alter table youtube_automations enable row level security;

create policy "Users can manage own youtube automations"
  on youtube_automations for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- One row per ACTIONED comment; comment_id (YouTube's top-level comment id)
-- UNIQUE = idempotency lock, exactly like automation_events.comment_id.
-- Service role writes, owner reads.

create table if not exists youtube_automation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  automation_id uuid references youtube_automations(id) on delete set null,
  comment_id text not null unique,
  video_id text,
  comment_text text,
  commenter_name text,
  matched_keyword text,
  reply_status text not null default 'pending',  -- pending | sent | failed | skipped
  reply_error text,
  created_at timestamptz default now(),
  processed_at timestamptz
);

alter table youtube_automation_events enable row level security;

create policy "Users can read own youtube automation events"
  on youtube_automation_events for select
  using (auth.uid() = user_id);

create index if not exists youtube_automation_events_user_created_idx
  on youtube_automation_events (user_id, created_at desc);
