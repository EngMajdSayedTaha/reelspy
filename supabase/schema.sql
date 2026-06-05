-- Profiles (extends Supabase auth.users)
create table profiles (
  id uuid references auth.users(id) primary key,
  username text,
  ig_access_token text,
  ig_user_id text,
  created_at timestamptz default now()
);

alter table profiles enable row level security;
create policy "Users can manage own profile"
  on profiles for all using (auth.uid() = id);

-- Inspiration accounts
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
  unique(user_id, ig_username)
);

alter table inspiration_accounts enable row level security;
create policy "Users can manage own accounts"
  on inspiration_accounts for all using (auth.uid() = user_id);

-- Tracked reels
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
  viral_score numeric generated always as (
    (like_count * 1.0) + (comment_count * 3.0) + (view_count * 0.01)
  ) stored,
  is_worked_on boolean default false,
  worked_on_at timestamptz,
  posted_at timestamptz,
  transcript text,
  transcript_lang text,
  transcript_source text,
  transcript_status text default 'none',
  transcript_generated_at timestamptz,
  media_duration_sec int,
  duration_checked_at timestamptz,
  created_at timestamptz default now()
);

alter table tracked_reels enable row level security;
create policy "Users can manage own reels"
  on tracked_reels for all using (auth.uid() = user_id);

-- Generated scripts
create table generated_scripts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  reel_id uuid references tracked_reels(id) on delete set null,
  hook text,
  body text,
  cta text,
  viral_pattern text,
  platform text default 'instagram_reels',
  status text default 'draft',
  scheduled_date date,
  created_at timestamptz default now()
);

alter table generated_scripts enable row level security;
create policy "Users can manage own scripts"
  on generated_scripts for all using (auth.uid() = user_id);
