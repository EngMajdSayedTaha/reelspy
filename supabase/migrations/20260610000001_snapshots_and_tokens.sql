-- Scaling layer: global snapshot cache + token lifecycle.
--
-- Why: Business Discovery is rate-limited per Meta APP (shared pool). If 800
-- creators all track @garyvee, fetching that public account 800× is pure waste
-- of the shared budget. This migration adds a GLOBAL cache so each public
-- account is fetched once per TTL and fanned out to every subscriber, plus the
-- columns needed to keep long-lived tokens alive at scale.

-- ── Global snapshot cache (shared, public Business Discovery data) ───────────

-- One row per public account, regardless of how many users track it.
create table if not exists ig_account_snapshots (
  ig_username text primary key,
  display_name text,
  followers_count bigint,
  avatar_url text,
  last_fetched_at timestamptz,           -- when reels were last pulled from Meta
  refresh_started_at timestamptz,        -- lease, so concurrent runs don't double-fetch
  last_status text not null default 'pending',  -- pending | ok | error | rate_limited | not_found
  last_error text,
  created_at timestamptz default now()
);

-- Shared reels per account. Personal state (favorites, discards, transcripts)
-- still lives in the per-user tracked_reels table; this holds only public data.
create table if not exists ig_reel_snapshots (
  ig_username text not null references ig_account_snapshots(ig_username) on delete cascade,
  ig_media_id text not null,
  permalink text,
  caption text,
  thumbnail_url text,
  view_count bigint default 0,
  like_count bigint default 0,
  comment_count bigint default 0,
  posted_at timestamptz,
  last_seen_at timestamptz default now(),
  primary key (ig_username, ig_media_id)
);

create index if not exists ig_reel_snapshots_username_idx on ig_reel_snapshots (ig_username);

-- Internal cache: only the service role (cron + server) touches it. RLS on with
-- no policies = no access for anon/authenticated clients.
alter table ig_account_snapshots enable row level security;
alter table ig_reel_snapshots enable row level security;

-- ── Token lifecycle ─────────────────────────────────────────────────────────

alter table profiles
  add column if not exists ig_token_expires_at timestamptz,
  add column if not exists ig_token_status text not null default 'active',  -- active | expired | invalid
  add column if not exists ig_token_refreshed_at timestamptz;

-- ── Rate limiter: allow a non-auth "system" caller for the background worker ──
-- The cron snapshot worker isn't a real user, so it charges quota under a fixed
-- system UUID. Drop the FK to auth.users so that id can exist.
alter table meta_api_user_usage drop constraint if exists meta_api_user_usage_user_id_fkey;
