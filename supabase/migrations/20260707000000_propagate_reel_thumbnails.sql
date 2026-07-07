-- Root cause of "avatars/thumbnails go blank": Instagram's CDN URLs
-- (avatar_url, thumbnail_url) are signed and expire after about a week. The
-- shared ig_account_snapshots/ig_reel_snapshots cache was already refreshed
-- daily (api/cron/refresh-snapshots), but that fresh URL only ever reached a
-- SINGLE user's inspiration_accounts/tracked_reels row — whichever user
-- happened to trigger the fetch. Every other user tracking the same public
-- account kept its stale, now-expired URL forever until they personally
-- clicked "Sync". bulk_propagate_reel_thumbnails lets the refresh path push a
-- freshly-fetched thumbnail to every user's copy of a reel in one statement.
--
-- Restricted to service_role: it updates other users' rows by ig_media_id
-- with no auth.uid() ownership check, which is only safe from the admin
-- (service-role) client used by the sync route and the snapshot cron.
create or replace function bulk_propagate_reel_thumbnails(p_rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count integer;
begin
  with updated as (
    update tracked_reels t
    set thumbnail_url = r->>'thumbnail_url'
    from jsonb_array_elements(p_rows) as r
    where t.ig_media_id = (r->>'ig_media_id')
      and r->>'thumbnail_url' is not null
      and t.thumbnail_url is distinct from (r->>'thumbnail_url')
    returning 1
  )
  select count(*) into v_count from updated;
  return v_count;
end;
$$;

revoke all on function bulk_propagate_reel_thumbnails(jsonb) from public, authenticated, anon;
grant execute on function bulk_propagate_reel_thumbnails(jsonb) to service_role;

-- The propagation update (and the existing per-user sync lookups) filter
-- tracked_reels by ig_media_id; there was no index backing that predicate.
create index if not exists tracked_reels_ig_media_id_idx on tracked_reels (ig_media_id);
