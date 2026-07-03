-- V5 (W3): relative "Outperforming" ranking. viral_score is absolute, so a
-- 2M-follower account's mediocre reel outranks a 5k-follower account's breakout.
-- This RPC ranks a user's feed by a RELATIVE score that normalizes for audience
-- size, and returns each reel's ratio vs its own account's median so small-niche
-- (UAE lead-gen) accounts surface. Paginated + filtered server-side so it slots
-- into the existing feed query in place of the plain table select.
--
-- security invoker → RLS on tracked_reels/inspiration_accounts still scopes every
-- read to the caller (auth.uid() = user_id); p_user_id is belt-and-suspenders.

create or replace function outperforming_feed(
  p_user_id uuid,
  p_account uuid default null,       -- null = all accounts
  p_group_ids uuid[] default null,   -- null = all; pass account ids for a group
  p_status text default 'new',       -- new | worked | favorites | all | discarded
  p_q text default null,             -- caption search
  p_limit int default 10,
  p_offset int default 0
)
returns table (
  id uuid,
  caption text,
  ig_permalink text,
  thumbnail_url text,
  view_count bigint,
  like_count bigint,
  comment_count bigint,
  viral_score numeric,
  is_worked_on boolean,
  posted_at timestamptz,
  transcript_status text,
  is_discarded boolean,
  is_favorite boolean,
  ig_username text,
  display_name text,
  avatar_url text,
  followers_count int,
  relative_score numeric,
  account_median numeric,
  outperform_ratio numeric,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with acct_median as (
    -- Median absolute score per account, over the user's non-discarded reels.
    select tr.account_id,
           -- percentile_cont returns double precision; cast so numeric math
           -- (round, the column type) works downstream.
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
           -- Floor followers at 1000 so tiny/zero-follower accounts aren't divided
           -- into absurdly large scores.
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
