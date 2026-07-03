-- Derived metrics for L5. Plain SQL views over app_events / ai_usage — no app
-- code. A view over an event that isn't wired yet simply returns no rows, so
-- these are safe to define ahead of every call site being instrumented.

-- Weekly Loop Completions (North Star): users who completed the research→output
-- loop — a research event (feed_synced / transcript_ready) followed within 7
-- days by an output event (script_generated, or a successful publish). Bucketed
-- by the week of the research event.
create or replace view wlc_weekly as
with research as (
  select user_id, created_at
  from app_events
  where event in ('feed_synced', 'transcript_ready')
),
output as (
  select user_id, created_at
  from app_events
  where event = 'script_generated'
     or (event = 'publish_job_finished' and props->>'status' = 'success')
)
select
  date_trunc('week', r.created_at) as week,
  count(distinct r.user_id) as loop_completers
from research r
where exists (
  select 1 from output o
  where o.user_id = r.user_id
    and o.created_at >= r.created_at
    and o.created_at < r.created_at + interval '7 days'
)
group by 1
order by 1;

-- Activation funnel + <10-min SLA, one row per user. Columns are the first time
-- each step happened; met_sla flags first-script within 10 min of signup.
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
from app_events
group by user_id;

-- Retention: signup-week cohort × active-week matrix (activity on any event).
create or replace view retention_cohorts as
with signup as (
  select user_id, date_trunc('week', min(created_at)) as cohort_week
  from app_events
  where event = 'signed_up'
  group by user_id
),
activity as (
  select distinct user_id, date_trunc('week', created_at) as active_week
  from app_events
)
select s.cohort_week, a.active_week, count(distinct a.user_id) as active_users
from signup s
join activity a on a.user_id = s.user_id
group by 1, 2
order by 1, 2;

-- Publish success rate by platform and week.
create or replace view publish_success_weekly as
select
  date_trunc('week', created_at) as week,
  props->>'platform' as platform,
  count(*) filter (where props->>'status' = 'success') as succeeded,
  count(*) as total,
  round(count(*) filter (where props->>'status' = 'success')::numeric
        / nullif(count(*), 0), 3) as success_rate
from app_events
where event = 'publish_job_finished'
group by 1, 2
order by 1, 2;

-- Per-user AI cost estimate (feeds tier-margin + free-tier-abuse checks).
-- Anthropic per-MTok pricing: Haiku 4.5 $1 in / $5 out, Sonnet 4.6 $3 / $15;
-- NVIDIA free tier = $0. Update the coefficients if the model map changes.
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
from ai_usage
group by user_id
order by est_usd desc;
