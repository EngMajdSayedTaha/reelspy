-- Per-user cache for the "My Reels & Insights" payload (own profile + media +
-- per-media insights).
--
-- Why: building this payload costs up to ~30 Graph API insights calls. Without
-- a cache the My IG page paid that price on EVERY visit (15-30s of sequential
-- fetching). With it, page loads are a single Postgres read; Meta is only hit
-- when the cache is stale (revalidated in the background) or the user forces a
-- sync.
create table if not exists ig_my_insights_cache (
  user_id uuid primary key references profiles(id) on delete cascade,
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  refresh_started_at timestamptz  -- lease, so concurrent revalidations don't double-fetch
);

-- Server-internal cache: only the service role touches it (the payload is
-- assembled from token-authenticated Graph reads). RLS on with no policies =
-- no access for anon/authenticated clients.
alter table ig_my_insights_cache enable row level security;
