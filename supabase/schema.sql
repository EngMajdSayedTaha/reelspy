-- ReelSpy database schema — full snapshot regenerated from the live Supabase
-- project (bsyzjlvgcpdxtdchkiva) on 2026-06-29.
--
-- This file is the authoritative picture of the deployed `public` schema:
-- tables, constraints, indexes, row-level security, policies, the column-level
-- token lockdown grants, functions, the auth trigger, and the publishing
-- storage bucket. It is reconstructed from the catalog (not a verbatim
-- pg_dump), so it is hand-formatted for readability but matches production.
-- Tables are ordered so foreign-key targets are created before their referrers.
--
-- To recreate from scratch you also need the Supabase-managed `auth` schema
-- (profiles.id and user_action_usage.user_id reference auth.users).

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ profiles — one row per auth user. Holds Instagram/Facebook OAuth tokens.   ║
-- ║ Token columns are locked down to SERVER-ONLY via column grants below.      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
create table profiles (
  id uuid primary key references auth.users(id),
  username text,
  ig_access_token text,                 -- SERVER ONLY (revoked from browser roles)
  ig_user_id text,
  created_at timestamptz default now(),
  ig_token_expires_at timestamptz,
  ig_token_status text not null default 'active',
  ig_token_refreshed_at timestamptz,
  fb_page_id text,
  fb_page_name text,
  fb_page_access_token text,            -- SERVER ONLY (revoked from browser roles)
  webhook_subscribed_at timestamptz,
  brand_voice jsonb,                    -- per-user AI persona (niche/audience/offer/tone/language)
  onboarded_at timestamptz,             -- first-run wizard completion marker (L7); null = not done
  digest_opt_out boolean not null default false  -- weekly digest unsubscribe (V3/W6)
);

alter table profiles enable row level security;
create policy "Users can manage own profile"
  on profiles for all using (auth.uid() = id) with check (auth.uid() = id);

-- Token lockdown: browser roles never see ig_access_token / fb_page_access_token.
-- Tokens are read/written only by the service-role client (which bypasses grants).
revoke all on table profiles from anon, authenticated;
grant select (id, username, ig_user_id, ig_token_expires_at, ig_token_status,
              ig_token_refreshed_at, fb_page_id, fb_page_name,
              webhook_subscribed_at, created_at, brand_voice, onboarded_at,
              digest_opt_out)
  on profiles to authenticated;
grant insert (id, username) on profiles to authenticated;
grant update (id, username, brand_voice, onboarded_at, digest_opt_out)
  on profiles to authenticated;

-- Auto-create a profile row when a new auth user signs up.
create or replace function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ── account_groups — user-defined folders for inspiration accounts ───────────
create table account_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  name text not null,
  created_at timestamptz default now(),
  unique (user_id, name)
);

alter table account_groups enable row level security;
create policy "Users can manage own groups"
  on account_groups for all using (auth.uid() = user_id);

-- ── inspiration_accounts — public IG accounts a user tracks for ideas ────────
create table inspiration_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  ig_username text not null,
  display_name text,
  avatar_url text,
  followers_count bigint,
  niche_tags text[],
  last_synced_at timestamptz,
  is_active boolean default true,
  created_at timestamptz default now(),
  group_id uuid references account_groups(id) on delete set null,
  unique (user_id, ig_username)
);

alter table inspiration_accounts enable row level security;
create policy "Users can manage own accounts"
  on inspiration_accounts for all using (auth.uid() = user_id);

create index inspiration_accounts_user_active_idx
  on inspiration_accounts (user_id, is_active);

-- ── tracked_reels — individual reels saved from inspiration accounts ─────────
create table tracked_reels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  account_id uuid references inspiration_accounts(id) on delete cascade,
  ig_media_id text,
  ig_permalink text not null,
  caption text,
  thumbnail_url text,
  view_count bigint default 0,
  like_count bigint default 0,
  comment_count bigint default 0,
  is_worked_on boolean default false,
  worked_on_at timestamptz,
  posted_at timestamptz,
  transcript text,
  transcript_lang text,
  transcript_source text,
  transcript_status text default 'none',
  transcript_generated_at timestamptz,
  created_at timestamptz default now(),
  is_discarded boolean default false,
  discarded_at timestamptz,
  is_favorite boolean default false,
  favorited_at timestamptz,
  transcript_srt text,
  -- NULL-safe stored virality score (coalesce keeps partially-synced reels rankable).
  viral_score numeric generated always as (
    (coalesce(like_count, 0) * 1.0)
    + (coalesce(comment_count, 0) * 3.0)
    + (coalesce(view_count, 0) * 0.01)
  ) stored
);

alter table tracked_reels enable row level security;
create policy "Users can manage own reels"
  on tracked_reels for all using (auth.uid() = user_id);

create index tracked_reels_user_viral_idx on tracked_reels (user_id, viral_score desc);
create index tracked_reels_user_posted_idx on tracked_reels (user_id, posted_at desc);

-- ── generated_scripts — AI-generated scripts, optionally tied to a reel ──────
create table generated_scripts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  reel_id uuid references tracked_reels(id) on delete set null,
  hook text,
  body text,
  cta text,
  platform text default 'instagram_reels',
  status text default 'draft',
  scheduled_date date,
  created_at timestamptz default now()
);

alter table generated_scripts enable row level security;
create policy "Users can manage own scripts"
  on generated_scripts for all using (auth.uid() = user_id);

-- ── saved_hooks — persistent hook library (W4/V1) ────────────────────────────
-- User-curated opening lines (from a transcript or typed manually), tagged and
-- reusable when generating scripts. reel_id SET NULL so a hook outlives its reel.
create table saved_hooks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  reel_id uuid references tracked_reels(id) on delete set null,
  text text not null,
  tags text[] not null default '{}',
  source text not null default 'manual' check (source in ('transcript', 'manual')),
  created_at timestamptz not null default now(),
  unique (user_id, text)
);
alter table saved_hooks enable row level security;
create policy "Users can manage own saved hooks"
  on saved_hooks for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index saved_hooks_user_created_idx on saved_hooks (user_id, created_at desc);
create index saved_hooks_tags_idx on saved_hooks using gin (tags);

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Global snapshot cache — shared dedup layer. Each public account/reel is    ║
-- ║ fetched from Meta at most once per TTL and shared across all users.        ║
-- ║ RLS is on with NO policies: reachable only via the service-role client.    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
create table ig_account_snapshots (
  ig_username text primary key,
  display_name text,
  followers_count bigint,
  avatar_url text,
  last_fetched_at timestamptz,
  refresh_started_at timestamptz,
  last_status text not null default 'pending',
  last_error text,
  created_at timestamptz default now()
);
alter table ig_account_snapshots enable row level security;

create table ig_reel_snapshots (
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
alter table ig_reel_snapshots enable row level security;
create index ig_reel_snapshots_username_idx on ig_reel_snapshots (ig_username);

-- ── ig_my_insights_cache — per-user cache of the owner's own IG insights ─────
create table ig_my_insights_cache (
  user_id uuid primary key references profiles(id) on delete cascade,
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  refresh_started_at timestamptz
);
alter table ig_my_insights_cache enable row level security;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Meta API rate limiter — guards the shared APP-level Business Discovery     ║
-- ║ pool (token bucket + circuit breaker) plus a per-user hourly window.       ║
-- ║ RLS on, no policies: mutated only via the SECURITY DEFINER functions.      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
create table meta_api_limiter (
  id smallint primary key default 1 check (id = 1),  -- singleton row
  tokens numeric not null default 160,
  bucket_updated_at timestamptz not null default now(),
  throttled_until timestamptz,
  app_usage_pct integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table meta_api_limiter enable row level security;

create table meta_api_user_usage (
  user_id uuid primary key,
  window_start timestamptz not null default now(),
  call_count integer not null default 0
);
alter table meta_api_user_usage enable row level security;

-- ── user_action_usage — per-user throttle for expensive AI/transcription ─────
-- actions (generate_script, growth_notes, transcript). RLS on, no policies:
-- mutated only via consume_user_action() below.
create table user_action_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  window_start timestamptz not null default now(),
  call_count integer not null default 0,
  primary key (user_id, action)
);
alter table user_action_usage enable row level security;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Auto-Reply (Instagram comments → public reply + DM)                        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
create table reel_automations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  ig_media_id text not null,
  media_caption text,
  media_permalink text,
  media_thumbnail_url text,
  keywords text[] not null,
  match_mode text not null default 'contains'
    check (match_mode in ('contains', 'exact', 'any')),
  public_reply_templates text[] not null default '{"Check your DMs 📩"}'::text[],
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
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index reel_automations_media_idx on reel_automations (ig_media_id);

create table automation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  automation_id uuid references reel_automations(id) on delete set null,
  comment_id text not null unique,        -- idempotency lock against webhook retries
  ig_media_id text,
  comment_text text,
  commenter_id text,
  commenter_username text,
  matched_keyword text,
  public_reply_status text not null default 'pending',
  public_reply_error text,
  dm_status text not null default 'pending',
  dm_error text,
  created_at timestamptz default now(),
  processed_at timestamptz
);
alter table automation_events enable row level security;
create policy "Users can read own automation events"
  on automation_events for select using (auth.uid() = user_id);
create index automation_events_user_created_idx
  on automation_events (user_id, created_at desc);

-- ── DM automations (Instagram DM keyword → auto reply) ───────────────────────
create table dm_automations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  keywords text[] not null,
  match_mode text not null default 'contains'
    check (match_mode in ('contains', 'exact', 'any')),
  reply_message text not null,
  reply_link text,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table dm_automations enable row level security;
create policy "Users can manage own dm automations"
  on dm_automations for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table dm_automation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  automation_id uuid references dm_automations(id) on delete set null,
  message_id text not null unique,        -- idempotency lock
  sender_id text,
  sender_username text,
  message_text text,
  matched_keyword text,
  reply_status text not null default 'pending',
  reply_error text,
  created_at timestamptz default now(),
  processed_at timestamptz
);
alter table dm_automation_events enable row level security;
create policy "Users can read own dm automation events"
  on dm_automation_events for select using (auth.uid() = user_id);
create index dm_automation_events_sender_idx
  on dm_automation_events (user_id, sender_id, created_at desc);
create index dm_automation_events_user_created_idx
  on dm_automation_events (user_id, created_at desc);

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Publishing — cross-post one upload to IG/FB/TikTok/YouTube.                ║
-- ║ social_connections token columns are SERVER-ONLY (column grants below).    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
create table social_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  platform text not null
    check (platform in ('instagram', 'facebook', 'tiktok', 'youtube')),
  account_id text not null,
  account_name text,
  account_username text,
  avatar_url text,
  access_token text,                       -- SERVER ONLY
  refresh_token text,                      -- SERVER ONLY
  token_expires_at timestamptz,
  token_status text not null default 'active',
  scopes text,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, platform, account_id)
);

alter table social_connections enable row level security;
create policy "Users can read own connections"
  on social_connections for select using (auth.uid() = user_id);
create policy "Users can update own connections"
  on social_connections for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own connections"
  on social_connections for delete using (auth.uid() = user_id);
create index social_connections_user_platform_idx
  on social_connections (user_id, platform);

-- Browser roles: metadata only, never the token columns.
revoke all on table social_connections from anon, authenticated;
grant select (id, user_id, platform, account_id, account_name, account_username,
              avatar_url, token_status, token_expires_at, scopes, is_active,
              created_at, updated_at)
  on social_connections to authenticated;
grant update (is_active) on social_connections to authenticated;
grant delete on table social_connections to authenticated;

create table publish_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  title text,
  caption text,
  hashtags text,
  video_path text not null,                -- object path in the publish-media bucket
  thumbnail_path text,
  duration_seconds integer,
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'publishing', 'done', 'partial', 'failed')),
  scheduled_at timestamptz,                -- null = publish immediately
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table publish_posts enable row level security;
create policy "Users can manage own posts"
  on publish_posts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index publish_posts_user_created_idx on publish_posts (user_id, created_at desc);
create index publish_posts_due_idx on publish_posts (status, scheduled_at);

create table publish_jobs (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references publish_posts(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  connection_id uuid references social_connections(id) on delete set null,
  platform text not null
    check (platform in ('instagram', 'facebook', 'tiktok', 'youtube')),
  privacy text not null default 'public',
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'published', 'failed')),
  remote_id text,
  remote_url text,
  error_message text,
  attempts integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  caption text,
  unique (post_id, connection_id)          -- idempotency: never double-post a target
);
alter table publish_jobs enable row level security;
create policy "Users can read own jobs"
  on publish_jobs for select using (auth.uid() = user_id);
create index publish_jobs_post_idx on publish_jobs (post_id);

-- ── YouTube auto-reply (comment keyword → public reply) ──────────────────────
create table youtube_automations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  connection_id uuid references social_connections(id) on delete set null,
  video_id text not null,
  video_title text,
  keywords text[] not null,
  match_mode text not null default 'contains'
    check (match_mode in ('contains', 'exact', 'any')),
  public_reply_templates text[] not null default '{}'::text[],
  is_active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, video_id)
);
alter table youtube_automations enable row level security;
create policy "Users can manage own youtube automations"
  on youtube_automations for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table youtube_automation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  automation_id uuid references youtube_automations(id) on delete set null,
  comment_id text not null unique,         -- idempotency lock
  video_id text,
  comment_text text,
  commenter_name text,
  matched_keyword text,
  reply_status text not null default 'pending',
  reply_error text,
  created_at timestamptz default now(),
  processed_at timestamptz
);
alter table youtube_automation_events enable row level security;
create policy "Users can read own youtube automation events"
  on youtube_automation_events for select using (auth.uid() = user_id);
create index youtube_automation_events_user_created_idx
  on youtube_automation_events (user_id, created_at desc);

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Functions (RPCs)                                                           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- Per-user fixed-window throttle for expensive actions. Atomically enforces the
-- quota and records the call. Returns allowed + seconds until the window resets.
create or replace function public.consume_user_action(
  p_user_id uuid,
  p_action text,
  p_limit integer,
  p_window_seconds integer
) returns table(allowed boolean, retry_after_seconds integer)
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_count int;
  v_window timestamptz;
  v_age numeric;
begin
  select call_count, window_start into v_count, v_window
  from user_action_usage
  where user_id = p_user_id and action = p_action
  for update;

  if not found then
    insert into user_action_usage(user_id, action, window_start, call_count)
      values (p_user_id, p_action, v_now, 0)
      on conflict (user_id, action) do nothing;
    v_count := 0; v_window := v_now;
  end if;

  v_age := extract(epoch from (v_now - v_window));
  if v_age >= p_window_seconds then
    v_count := 0; v_window := v_now;
  end if;

  if v_count + 1 > p_limit then
    return query select false, greatest(1, ceil(p_window_seconds - v_age)::int);
    return;
  end if;

  update user_action_usage
    set call_count = v_count + 1, window_start = v_window
    where user_id = p_user_id and action = p_action;

  return query select true, 0;
end;
$$;
grant execute on function public.consume_user_action(uuid, text, integer, integer)
  to authenticated, service_role;

-- Bulk metric refresh: apply a whole batch of reel metrics in one statement.
-- SECURITY INVOKER + auth.uid() predicate => runs under the caller's RLS.
create or replace function public.bulk_update_tracked_reel_metrics(
  p_account_id uuid,
  p_rows jsonb
) returns integer
  language plpgsql
  security invoker
  set search_path = public
as $$
declare
  v_count integer;
begin
  with updated as (
    update tracked_reels t
    set view_count = coalesce((r->>'view_count')::bigint, 0),
        like_count = coalesce((r->>'like_count')::bigint, 0),
        comment_count = coalesce((r->>'comment_count')::bigint, 0),
        thumbnail_url = r->>'thumbnail_url'
    from jsonb_array_elements(p_rows) as r
    where t.user_id = auth.uid()
      and t.account_id = p_account_id
      and t.ig_media_id = (r->>'ig_media_id')
    returning 1
  )
  select count(*) into v_count from updated;
  return v_count;
end;
$$;
grant execute on function public.bulk_update_tracked_reel_metrics(uuid, jsonb)
  to authenticated;

-- Meta API token-bucket limiter: circuit breaker + app-wide budget + per-user
-- hourly window, enforced atomically. Server-only (service_role).
create or replace function public.consume_meta_quota(
  p_user_id uuid,
  p_cost integer,
  p_capacity numeric,
  p_refill_per_sec numeric,
  p_user_cap integer
) returns table(allowed boolean, retry_after_seconds integer, reason text)
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_tokens numeric;
  v_bucket_at timestamptz;
  v_throttled timestamptz;
  v_elapsed numeric;
  v_user_count int;
  v_user_window timestamptz;
  v_window_age numeric;
begin
  -- Lock the singleton limiter row (create it on first use).
  select tokens, bucket_updated_at, throttled_until
    into v_tokens, v_bucket_at, v_throttled
  from meta_api_limiter where id = 1 for update;

  if not found then
    insert into meta_api_limiter(id, tokens, bucket_updated_at)
      values (1, p_capacity, v_now)
      on conflict (id) do nothing;
    v_tokens := p_capacity; v_bucket_at := v_now; v_throttled := null;
  end if;

  -- 1) Circuit breaker — short-circuit while Meta is (or may be) blocking us.
  if v_throttled is not null and v_throttled > v_now then
    return query select false,
      greatest(1, ceil(extract(epoch from (v_throttled - v_now)))::int),
      'circuit_open'::text;
    return;
  end if;

  -- 2) Refill the app-wide token bucket from elapsed time.
  v_elapsed := greatest(0, extract(epoch from (v_now - v_bucket_at)));
  v_tokens := least(p_capacity, v_tokens + v_elapsed * p_refill_per_sec);

  -- 3) Per-user fixed hourly window.
  select call_count, window_start into v_user_count, v_user_window
  from meta_api_user_usage where user_id = p_user_id for update;

  if not found then
    insert into meta_api_user_usage(user_id, window_start, call_count)
      values (p_user_id, v_now, 0)
      on conflict (user_id) do nothing;
    v_user_count := 0; v_user_window := v_now;
  end if;

  v_window_age := extract(epoch from (v_now - v_user_window));
  if v_window_age >= 3600 then
    v_user_count := 0; v_user_window := v_now;
  end if;

  if v_user_count + p_cost > p_user_cap then
    update meta_api_limiter
      set tokens = v_tokens, bucket_updated_at = v_now, updated_at = v_now
      where id = 1;
    return query select false,
      greatest(1, ceil(3600 - v_window_age)::int), 'user_quota'::text;
    return;
  end if;

  -- 4) App-wide budget (token bucket).
  if v_tokens < p_cost then
    update meta_api_limiter
      set tokens = v_tokens, bucket_updated_at = v_now, updated_at = v_now
      where id = 1;
    return query select false,
      greatest(1, ceil((p_cost - v_tokens) / nullif(p_refill_per_sec, 0))::int),
      'app_budget'::text;
    return;
  end if;

  -- Allowed: spend a token and record the user's call.
  update meta_api_limiter
    set tokens = v_tokens - p_cost, bucket_updated_at = v_now, updated_at = v_now
    where id = 1;

  update meta_api_user_usage
    set call_count = v_user_count + p_cost, window_start = v_user_window
    where user_id = p_user_id;

  return query select true, 0, 'ok'::text;
end;
$$;
grant execute on function
  public.consume_meta_quota(uuid, integer, numeric, numeric, integer)
  to service_role;

-- Record Meta's reported app-usage % (from response headers).
create or replace function public.record_meta_usage(p_usage integer)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  update meta_api_limiter
    set app_usage_pct = p_usage, updated_at = now()
  where id = 1;
end;
$$;
grant execute on function public.record_meta_usage(integer) to service_role;

-- Trip the circuit breaker for p_seconds (Meta hard-throttled us).
create or replace function public.trip_meta_circuit(
  p_seconds integer,
  p_usage integer default null
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  update meta_api_limiter
    set throttled_until = greatest(coalesce(throttled_until, now()),
                                   now() + make_interval(secs => greatest(1, p_seconds))),
        tokens = 0,
        bucket_updated_at = now(),
        app_usage_pct = coalesce(p_usage, app_usage_pct),
        updated_at = now()
  where id = 1;
end;
$$;
grant execute on function public.trip_meta_circuit(integer, integer) to service_role;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Instrumentation (L5) — event + AI-usage logs. Service-role only (RLS on,   ║
-- ║ no policies). Written via lib/analytics/track.ts; derived metrics are      ║
-- ║ plain SQL views in migration 20260703c_instrumentation_views.sql.          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
create table app_events (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  event text not null,
  props jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index app_events_user_event_idx on app_events (user_id, event, created_at desc);
create index app_events_event_time_idx on app_events (event, created_at desc);
alter table app_events enable row level security;  -- no policies: service-role only

create table ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  action text not null,                 -- 'script' | 'growth_notes'
  provider text not null,               -- 'nvidia' | 'anthropic'
  model text not null,
  input_tokens int,
  output_tokens int,
  created_at timestamptz not null default now()
);
create index ai_usage_user_time_idx on ai_usage (user_id, created_at desc);
alter table ai_usage enable row level security;  -- no policies: service-role only

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Durable job queue (H1 / V4)                                               ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Worked by /api/cron/run-jobs. Producers: scheduled publishing, post-sync
-- auto-transcribe, weekly digest fan-out. Service-role only (RLS on, no
-- policies); claim_jobs is the atomic `for update skip locked` claim.
create table jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null,                     -- 'publish_post' | 'transcribe_reel' | 'send_digest'
  payload jsonb not null default '{}',
  user_id uuid references profiles(id) on delete cascade,
  run_at timestamptz not null default now(),
  attempts int not null default 0,
  max_attempts int not null default 5,
  locked_at timestamptz,
  locked_by text,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'done', 'failed')),
  last_error text,
  dedup_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table jobs enable row level security;  -- no policies: service-role only
create index jobs_due_idx on jobs (status, run_at)
  where status in ('queued', 'running');
create unique index jobs_dedup_active_idx on jobs (dedup_key)
  where dedup_key is not null and status in ('queued', 'running');

create or replace function claim_jobs(
  p_worker text,
  p_kinds text[],
  p_limit int,
  p_lock_timeout_seconds int default 600
) returns setof jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update jobs j
    set status = 'running',
        locked_at = now(),
        locked_by = p_worker,
        attempts = j.attempts + 1,
        updated_at = now()
  where j.id in (
    select id from jobs c
    where c.kind = any(p_kinds)
      and (
        (c.status = 'queued' and c.run_at <= now())
        or (
          c.status = 'running'
          and c.locked_at < now() - make_interval(secs => p_lock_timeout_seconds)
        )
      )
    order by c.run_at
    for update skip locked
    limit greatest(1, p_limit)
  )
  returning j.*;
end;
$$;
revoke all on function claim_jobs(text, text[], int, int) from public, anon, authenticated;
grant execute on function claim_jobs(text, text[], int, int) to service_role;

-- Derived analytics views (L5). security_invoker=on so the querying role's RLS
-- applies (authenticated → 0 rows; service-role/SQL editor → all); browser access
-- revoked. See migration 20260703c_instrumentation_views.sql for full notes.
create or replace view wlc_weekly as
with research as (
  select user_id, created_at from app_events
  where event in ('feed_synced', 'transcript_ready')
),
output as (
  select user_id, created_at from app_events
  where event = 'script_generated'
     or (event = 'publish_job_finished' and props->>'status' = 'success')
)
select date_trunc('week', r.created_at) as week, count(distinct r.user_id) as loop_completers
from research r
where exists (
  select 1 from output o
  where o.user_id = r.user_id
    and o.created_at >= r.created_at
    and o.created_at < r.created_at + interval '7 days'
)
group by 1 order by 1;

create or replace view activation_funnel as
select
  user_id,
  min(created_at) filter (where event = 'signed_up')       as signed_up_at,
  min(created_at) filter (where event = 'ig_connected')     as ig_connected_at,
  min(created_at) filter (where event = 'account_added')    as account_added_at,
  min(created_at) filter (where event = 'feed_synced')      as feed_synced_at,
  min(created_at) filter (where event = 'script_generated') as first_script_at,
  min(created_at) filter (where event = 'script_generated')
    - min(created_at) filter (where event = 'signed_up')    as time_to_first_script,
  (min(created_at) filter (where event = 'script_generated')
    - min(created_at) filter (where event = 'signed_up')) < interval '10 minutes' as met_sla
from app_events group by user_id;

create or replace view retention_cohorts as
with signup as (
  select user_id, date_trunc('week', min(created_at)) as cohort_week
  from app_events where event = 'signed_up' group by user_id
),
activity as (
  select distinct user_id, date_trunc('week', created_at) as active_week from app_events
)
select s.cohort_week, a.active_week, count(distinct a.user_id) as active_users
from signup s join activity a on a.user_id = s.user_id
group by 1, 2 order by 1, 2;

create or replace view publish_success_weekly as
select
  date_trunc('week', created_at) as week,
  props->>'platform' as platform,
  count(*) filter (where props->>'status' = 'success') as succeeded,
  count(*) as total,
  round(count(*) filter (where props->>'status' = 'success')::numeric
        / nullif(count(*), 0), 3) as success_rate
from app_events where event = 'publish_job_finished'
group by 1, 2 order by 1, 2;

create or replace view ai_cost_per_user as
select
  user_id,
  count(*) as calls,
  sum(coalesce(input_tokens, 0))  as input_tokens,
  sum(coalesce(output_tokens, 0)) as output_tokens,
  round(sum(
    case
      when model like 'claude-haiku%'  then coalesce(input_tokens,0)/1e6*1.0 + coalesce(output_tokens,0)/1e6*5.0
      when model like 'claude-sonnet%' then coalesce(input_tokens,0)/1e6*3.0 + coalesce(output_tokens,0)/1e6*15.0
      else 0
    end
  )::numeric, 4) as est_usd
from ai_usage group by user_id order by est_usd desc;

alter view wlc_weekly             set (security_invoker = on);
alter view activation_funnel      set (security_invoker = on);
alter view retention_cohorts      set (security_invoker = on);
alter view publish_success_weekly set (security_invoker = on);
alter view ai_cost_per_user       set (security_invoker = on);
revoke all on wlc_weekly, activation_funnel, retention_cohorts,
              publish_success_weekly, ai_cost_per_user
  from anon, authenticated;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Billing (L6/B1) — see migration 20260703d_billing.sql for full notes.      ║
-- ║ subscriptions is written ONLY by the Stripe webhook (service-role); owners  ║
-- ║ may read but never write their row. user_monthly_usage + the RPC enforce    ║
-- ║ per-tier monthly quotas (scripts/transcripts).                              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
create table subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  tier text not null default 'free',
  status text not null default 'inactive',
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);
create index subscriptions_stripe_customer_idx on subscriptions (stripe_customer_id);

alter table subscriptions enable row level security;
create policy "Users can read own subscription"
  on subscriptions for select using (auth.uid() = user_id);
revoke all on table subscriptions from anon, authenticated;
grant select on table subscriptions to authenticated;

create table user_monthly_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  period_month date not null,
  call_count int not null default 0,
  primary key (user_id, action, period_month)
);
alter table user_monthly_usage enable row level security;  -- no policies: RPC-only

create or replace function consume_user_action_monthly(
  p_user_id uuid,
  p_action text,
  p_limit int
) returns table(allowed boolean, used int, remaining int, period_end timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period date := date_trunc('month', now() at time zone 'utc')::date;
  v_end timestamptz := ((v_period + interval '1 month')::timestamp at time zone 'utc');
  v_count int;
begin
  select call_count into v_count
  from user_monthly_usage
  where user_id = p_user_id and action = p_action and period_month = v_period
  for update;

  if not found then
    insert into user_monthly_usage(user_id, action, period_month, call_count)
      values (p_user_id, p_action, v_period, 0)
      on conflict (user_id, action, period_month) do nothing;
    v_count := 0;
  end if;

  if p_limit >= 0 and v_count + 1 > p_limit then
    return query select false, v_count, 0, v_end;
    return;
  end if;

  update user_monthly_usage
    set call_count = v_count + 1
    where user_id = p_user_id and action = p_action and period_month = v_period;

  return query select
    true,
    v_count + 1,
    case when p_limit < 0 then -1 else greatest(0, p_limit - (v_count + 1)) end,
    v_end;
end;
$$;
revoke execute on function consume_user_action_monthly(uuid, text, int) from public, anon;
grant execute on function consume_user_action_monthly(uuid, text, int)
  to authenticated, service_role;

-- ── outperforming_feed — relative "Outperforming" ranking (W3/V5) ────────────
-- Ranks a user's feed by a follower-normalized relative score so small-niche
-- accounts surface, and returns each reel's ratio vs its account's median.
-- security invoker → RLS scopes every read to the caller.
create or replace function outperforming_feed(
  p_user_id uuid,
  p_account uuid default null,
  p_group_ids uuid[] default null,
  p_status text default 'new',
  p_q text default null,
  p_limit int default 10,
  p_offset int default 0
)
returns table (
  id uuid, caption text, ig_permalink text, thumbnail_url text,
  view_count bigint, like_count bigint, comment_count bigint,
  viral_score numeric, is_worked_on boolean, posted_at timestamptz,
  transcript_status text, is_discarded boolean, is_favorite boolean,
  ig_username text, display_name text, avatar_url text,
  followers_count int, relative_score numeric, account_median numeric,
  outperform_ratio numeric, total_count bigint
)
language sql stable security invoker set search_path = public
as $$
  with acct_median as (
    select tr.account_id,
           (percentile_cont(0.5) within group (order by tr.viral_score))::numeric as med
    from tracked_reels tr
    where tr.user_id = p_user_id and tr.is_discarded = false
    group by tr.account_id
  ),
  filtered as (
    select r.id, r.caption, r.ig_permalink, r.thumbnail_url, r.view_count,
           r.like_count, r.comment_count, r.viral_score, r.is_worked_on,
           r.posted_at, r.transcript_status, r.is_discarded, r.is_favorite,
           r.account_id,
           ia.ig_username, ia.display_name, ia.avatar_url, ia.followers_count
    from tracked_reels r
    join inspiration_accounts ia
      on ia.id = r.account_id and ia.is_active = true
    where r.user_id = p_user_id
      and (p_account is null or r.account_id = p_account)
      and (p_group_ids is null or r.account_id = any(p_group_ids))
      and (
        (p_status = 'discarded' and r.is_discarded = true)
        or (p_status <> 'discarded' and r.is_discarded = false and (
              p_status = 'all'
              or (p_status = 'new' and r.is_worked_on = false)
              or (p_status = 'worked' and r.is_worked_on = true)
              or (p_status = 'favorites' and r.is_favorite = true)
        ))
      )
      and (p_q is null or p_q = '' or r.caption ilike '%' || p_q || '%')
  ),
  scored as (
    select f.*,
           f.viral_score / greatest(coalesce(f.followers_count, 0), 1000) as relative_score,
           am.med as account_median,
           case when am.med is null or am.med = 0 then null
                else round(f.viral_score / am.med, 2) end as outperform_ratio
    from filtered f
    left join acct_median am on am.account_id = f.account_id
  )
  select id, caption, ig_permalink, thumbnail_url, view_count, like_count,
         comment_count, viral_score, is_worked_on, posted_at, transcript_status,
         is_discarded, is_favorite, ig_username, display_name, avatar_url,
         followers_count, relative_score, account_median, outperform_ratio,
         count(*) over() as total_count
  from scored
  order by relative_score desc nulls last, viral_score desc nulls last
  limit p_limit offset p_offset;
$$;
revoke execute on function outperforming_feed(uuid, uuid, uuid[], text, text, int, int) from anon;
grant execute on function outperforming_feed(uuid, uuid, uuid[], text, text, int, int) to authenticated;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Storage — private bucket for uploaded publish videos.                      ║
-- ║ Objects live under {user_id}/...; RLS keys off the first path segment.     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
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
