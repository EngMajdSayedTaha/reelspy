-- Collapse the per-reel metric refresh into one round-trip.
--
-- materializeForUser() previously issued one UPDATE per existing reel (one
-- network round-trip each) when refreshing public metrics during a sync. This
-- function takes the whole batch as JSON and applies it in a single statement.
--
-- SECURITY INVOKER + the auth.uid() predicate means it runs under the caller's
-- RLS: a user can only ever touch their own tracked_reels rows. There is no
-- unique constraint on (user_id, account_id, ig_media_id) — and the collab-reel
-- model intentionally allows the same ig_media_id under different accounts — so
-- this updates in place rather than upserting.
create or replace function bulk_update_tracked_reel_metrics(
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

grant execute on function bulk_update_tracked_reel_metrics(uuid, jsonb) to authenticated;
