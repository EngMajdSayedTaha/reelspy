-- Daily follower/metric history per Instagram account.
--
-- Before this table there was no time-series data anywhere in the product:
-- `ig_account_snapshots.followers_count` and `tracked_reels.view_count` are both
-- overwritten in place on every sync, so "did this account grow?" was not a
-- question the data could answer at all. One extra upsert on a code path that
-- already fetched the number makes it answerable from here on.
--
-- Keyed by ig_username, NOT by user: a follower count is a property of the
-- public account, not of anyone's tracking relationship with it. Per-user rows
-- would write N copies for one shared fetch (defeating the entire point of the
-- snapshot cache) and would show an empty chart to someone who added the
-- account yesterday. Global means a new user inherits the history immediately,
-- and it leaks nothing — public follower counts are public.
create table if not exists ig_account_metric_history (
  ig_username text not null
    references ig_account_snapshots(ig_username) on delete cascade,
  -- One row per UTC day, upserted: a user hammering "force refresh" twenty
  -- times must produce one data point, not twenty. Last write of the day wins.
  captured_on date not null,
  followers_count bigint,
  -- Aggregates over the reels fetched in THIS pass. A normal sync fetches 25
  -- reels; an archive walk fetches thousands — the two are not comparable, so
  -- sample_size is stored alongside and any chart over these columns must
  -- filter on it. v1 charts followers_count only, which always is comparable.
  sample_size int,
  sample_views bigint,
  sample_likes bigint,
  sample_comments bigint,
  captured_at timestamptz not null default now(),
  primary key (ig_username, captured_on)
);

-- RLS on with no policies: service-role only, identical to ig_account_snapshots
-- and ig_reel_snapshots. The dossier reads it through the admin client.
alter table ig_account_metric_history enable row level security;

create index if not exists ig_account_metric_history_recent_idx
  on ig_account_metric_history (ig_username, captured_on desc);
