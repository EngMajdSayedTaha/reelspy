-- Auto-Reply module: keyword-triggered comment replies + private-reply DMs.
--
-- A creator links one of their OWN reels to keywords. When a follower comments
-- a matching keyword, the webhook processor posts a public reply under the
-- comment and sends the follower a private reply DM (link delivery). Meta
-- allows exactly ONE private reply per comment, within 7 days of the comment —
-- the unique comment_id below doubles as the idempotency lock that enforces
-- one action per comment even across webhook retries and polling overlap.

-- ── Automations: one per own reel ────────────────────────────────────────────

create table if not exists reel_automations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  ig_media_id text not null,
  -- Media snapshot so the UI never needs a Graph call to render the list.
  media_caption text,
  media_permalink text,
  media_thumbnail_url text,
  keywords text[] not null,
  match_mode text not null default 'contains' check (match_mode in ('contains', 'exact')),
  -- Rotated randomly per reply so the public replies look less bot-like.
  public_reply_templates text[] not null default '{"Check your DMs 📩"}',
  dm_message text not null,
  dm_link text,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, ig_media_id)
);

alter table reel_automations enable row level security;

create policy "Users can manage own automations"
  on reel_automations for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Event log: one row per ACTIONED comment ──────────────────────────────────
-- Inserted only when a comment matched a keyword. The webhook processor (service
-- role) is the sole writer; the owner can read it for the dashboard log.

create table if not exists automation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  automation_id uuid references reel_automations(id) on delete set null,
  comment_id text not null unique,
  ig_media_id text,
  comment_text text,
  commenter_id text,
  commenter_username text,
  matched_keyword text,
  public_reply_status text not null default 'pending',  -- pending | sent | failed | skipped
  public_reply_error text,
  dm_status text not null default 'pending',            -- pending | sent | failed | skipped
  dm_error text,
  created_at timestamptz default now(),
  processed_at timestamptz
);

alter table automation_events enable row level security;

create policy "Users can read own automation events"
  on automation_events for select
  using (auth.uid() = user_id);

create index if not exists automation_events_user_created_idx
  on automation_events (user_id, created_at desc);

-- ── Page credentials ─────────────────────────────────────────────────────────
-- Private replies are sent with a PAGE access token (POST /{page-id}/messages),
-- not the user token. Derived from the long-lived user token at connect time.
--
-- 20260611_lock_down_ig_tokens.sql revoked table-wide access on profiles and
-- granted explicit columns only, so these new columns are invisible to browser
-- roles by default — the page TOKEN stays server-only with no extra work.
-- Expose just the harmless metadata the UI needs for connection status.

alter table profiles
  add column if not exists fb_page_id text,
  add column if not exists fb_page_name text,
  add column if not exists fb_page_access_token text,
  add column if not exists webhook_subscribed_at timestamptz;

grant select (fb_page_id, fb_page_name, webhook_subscribed_at) on profiles to authenticated;
