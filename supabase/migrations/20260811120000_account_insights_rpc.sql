-- Exact, full-set aggregates for one tracked account, for the account dossier
-- at /dashboard/accounts/[id].
--
-- Why an RPC rather than computing this in the app: after a full-history
-- archive an account can hold 2,000+ reels. Pulling every row through PostgREST
-- to take a median would serialize megabytes into the RSC payload on every page
-- load, and a median over a truncated window is simply wrong. `percentile_cont`
-- in Postgres is the only honest way to get it, and it is the same function
-- `outperforming_feed` already uses for the per-account median.
--
-- security invoker → RLS scopes every read to the caller, same posture as
-- outperforming_feed. p_user_id is still passed explicitly so the planner can
-- use the (user_id, …) indexes rather than relying on the policy predicate.
create or replace function account_insights(
  p_user_id uuid,
  p_account_id uuid
)
returns table (
  reels_total bigint,
  reels_discarded bigint,
  reels_favorite bigint,
  reels_worked bigint,
  views_total bigint,
  likes_total bigint,
  comments_total bigint,
  views_median numeric,
  views_avg numeric,
  views_p90 numeric,
  views_max bigint,
  likes_median numeric,
  comments_median numeric,
  viral_median numeric,
  viral_p90 numeric,
  viral_max numeric,
  first_posted_at timestamptz,
  last_posted_at timestamptz,
  first_tracked_at timestamptz,
  transcripts_ready bigint,
  transcripts_failed bigint,
  transcripts_pending bigint,
  posting_days bigint,
  scripts_generated bigint,
  hooks_saved bigint
)
language sql stable security invoker set search_path = public
as $$
  with mine as (
    select r.*
    from tracked_reels r
    where r.user_id = p_user_id
      and r.account_id = p_account_id
  ),
  -- Discarded reels count toward "what you did with this account" but must not
  -- pollute the performance stats, so every metric below reads from `kept`.
  kept as (
    select * from mine where is_discarded = false
  )
  select
    (select count(*) from kept),
    (select count(*) from mine where is_discarded = true),
    (select count(*) from kept where is_favorite = true),
    (select count(*) from kept where is_worked_on = true),
    (select coalesce(sum(view_count), 0) from kept),
    (select coalesce(sum(like_count), 0) from kept),
    (select coalesce(sum(comment_count), 0) from kept),
    (select (percentile_cont(0.5) within group (order by view_count))::numeric from kept),
    (select avg(view_count)::numeric from kept),
    (select (percentile_cont(0.9) within group (order by view_count))::numeric from kept),
    (select max(view_count) from kept),
    (select (percentile_cont(0.5) within group (order by like_count))::numeric from kept),
    (select (percentile_cont(0.5) within group (order by comment_count))::numeric from kept),
    (select (percentile_cont(0.5) within group (order by viral_score))::numeric from kept),
    (select (percentile_cont(0.9) within group (order by viral_score))::numeric from kept),
    (select max(viral_score) from kept),
    (select min(posted_at) from kept),
    (select max(posted_at) from kept),
    (select min(created_at) from mine),
    (select count(*) from kept where transcript_status = 'ready'),
    (select count(*) from kept where transcript_status = 'failed'),
    (select count(*) from kept where transcript_status = 'pending'),
    (select count(distinct date(posted_at)) from kept where posted_at is not null),
    -- Lower bounds, both of them: generated_scripts.reel_id and
    -- saved_hooks.reel_id are `on delete set null`, so a script whose source
    -- reel was later removed no longer points anywhere.
    (select count(*) from generated_scripts g
      where g.user_id = p_user_id and g.reel_id in (select id from mine)),
    (select count(*) from saved_hooks h
      where h.user_id = p_user_id and h.reel_id in (select id from mine));
$$;

revoke execute on function account_insights(uuid, uuid) from anon;
grant execute on function account_insights(uuid, uuid) to authenticated;

-- The dossier's reel window filters by (user_id, account_id) and orders by
-- posted_at. The existing tracked_reels_user_posted_idx is (user_id, posted_at),
-- so that query scans every reel the user owns and discards the ones belonging
-- to other accounts. Fine at ten accounts, not at a hundred.
create index if not exists tracked_reels_account_posted_idx
  on tracked_reels (account_id, posted_at desc nulls last);
