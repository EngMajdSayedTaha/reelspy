-- V1 (W4): persistent hook library. Users save scroll-stopping opening lines
-- (from a reel transcript or typed manually), tag them, filter by tag, and reuse
-- them when generating scripts. The accumulated per-niche corpus is moat data.
--
-- RLS/ownership follows the tracked_reels pattern (owner-only, `for all`).
-- reel_id is ON DELETE SET NULL so a saved hook outlives the reel it came from.

create table if not exists saved_hooks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  reel_id uuid references tracked_reels(id) on delete set null,
  text text not null,
  tags text[] not null default '{}',
  source text not null default 'manual' check (source in ('transcript', 'manual')),
  created_at timestamptz not null default now(),
  -- One copy of a given hook per user (case-insensitive) so re-saving is a no-op.
  unique (user_id, text)
);

alter table saved_hooks enable row level security;

create policy "Users can manage own saved hooks"
  on saved_hooks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists saved_hooks_user_created_idx
  on saved_hooks (user_id, created_at desc);
-- GIN index so tag-filter queries (tags && '{...}') stay fast as the corpus grows.
create index if not exists saved_hooks_tags_idx on saved_hooks using gin (tags);
