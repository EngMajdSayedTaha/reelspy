-- Full-history archive of a public account's reels: a deep, RESUMABLE Business
-- Discovery walk backwards through the media edge, built on the existing shared
-- snapshot cache (ig_reel_snapshots holds the reels — no second copy).
--
-- Two tables, because two different things have two different lifetimes:
--
--   ig_account_archives          per ACCOUNT. How far back the walk has reached
--                                and the cursor to resume it. Shared by everyone,
--                                exactly like ig_reel_snapshots: the second
--                                person to ask for @nike pays nothing for the
--                                history the first person already pulled.
--
--   ig_account_archive_requests  per (ACCOUNT, USER). Who asked, and how deep.
--                                Fan-out on completion is limited to these rows.
--                                Without it, one paid user's deep pull would
--                                land in the feed of every free user who happens
--                                to track the same account — handing out the
--                                paid feature as a side effect of someone else
--                                buying it.
--
-- Service-role only: RLS on with no policies, same posture as the snapshot
-- tables this builds on.

create table if not exists ig_account_archives (
  ig_username text primary key
    references ig_account_snapshots(ig_username) on delete cascade,

  status text not null default 'queued'
    check (status in ('queued', 'running', 'done', 'partial', 'failed')),

  -- Opaque Meta cursor for the NEXT page of the backwards walk; null means
  -- "start from newest". This column is the whole point of the table: the walk
  -- spans many worker passes and a full Meta cooldown, so the position in the
  -- account's history has to outlive the process holding it.
  cursor text,

  -- True once Meta stopped handing out cursors: the walk reached the account's
  -- first post. No deeper request can ever return more, so a later "everything"
  -- ask is answered from cache without spending a single call.
  exhausted boolean not null default false,

  -- Oldest media timestamp actually SEEN — across ALL media types, not just
  -- reels. Coverage is [oldest_seen_at, now]. A page of nothing but carousels
  -- still moves the walk backwards, so the boundary can't be judged on reels.
  oldest_seen_at timestamptz,

  -- The cutoff the current walk is heading for. Null = "everything".
  target_since timestamptz,

  reels_found int not null default 0,
  pages_fetched int not null default 0,

  started_at timestamptz,
  finished_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

create table if not exists ig_account_archive_requests (
  ig_username text not null
    references ig_account_snapshots(ig_username) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,

  -- How deep this user asked to go. Null = everything.
  since timestamptz,
  requested_at timestamptz not null default now(),

  -- When the finished archive was last copied into this user's tracked_reels,
  -- and how much landed. Lets a repeat request tell "already yours" apart from
  -- "shared cache has it, but you've never received it".
  materialized_at timestamptz,
  reels_materialized int not null default 0,

  primary key (ig_username, user_id)
);

-- "Which archives has this user asked for?" — the accounts page reads this per
-- user on load; the primary key is account-first and can't serve it.
create index if not exists ig_account_archive_requests_user_idx
  on ig_account_archive_requests (user_id);

alter table ig_account_archives enable row level security;          -- no policies
alter table ig_account_archive_requests enable row level security;  -- no policies

-- Materializing an archive reads a whole account's reels newest-first, and an
-- archived account holds thousands rather than the 25 a sync deals with. The
-- existing ig_reel_snapshots_username_idx covers the lookup but not the sort,
-- so every materialize pass would sort the account's full history from scratch.
create index if not exists ig_reel_snapshots_username_posted_idx
  on ig_reel_snapshots (ig_username, posted_at desc nulls last);
