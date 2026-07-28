-- Split what the APP spends from what the USER spends.
--
-- Until now consume_meta_quota charged the same p_cost to both the app-wide
-- token bucket and the per-user hourly counter. But those measure different
-- things:
--
--   * The app bucket must track real Meta HTTP calls, because that is what
--     Meta's Platform Rate Limit actually counts.
--   * The per-user counter is shown to a human, so it has to be denominated in
--     something a human does: "refresh one account".
--
-- Charging both per HTTP call leaked pagination into the user-facing number.
-- fetchAccountReels pages up to 20 times (graph-api.ts MAX_PAGES), so a single
-- account refresh at depth 200 silently cost 20 units of an 80-unit budget — a
-- quarter of the user's hour for one click, with nothing in the UI explaining
-- why. Four clicks and they were locked out.
--
-- Fix: a separate p_user_cost. The caller charges the bucket per call (cost 1
-- per page) but charges the user once per logical refresh (cost 1 on the first
-- page, 0 on the rest — see MetaRateLimiter.startOperation). p_user_cost
-- defaults to p_cost, so any caller still passing five arguments keeps the old
-- behaviour and the rollout is safe in either order.
--
-- A zero user-cost call deliberately still passes the cap check: once a refresh
-- has started, it must be allowed to finish its pages rather than be cut off
-- half-way and leave the snapshot torn.

-- Drop the 5-arg version first: keeping both would make a 5-named-argument call
-- ambiguous, and consume_meta_quota fails OPEN, so an ambiguity error would
-- silently disable the limiter rather than surface.
drop function if exists consume_meta_quota(uuid, int, numeric, numeric, int);

create or replace function consume_meta_quota(
  p_user_id uuid,
  p_cost int,
  p_capacity numeric,
  p_refill_per_sec numeric,
  p_user_cap int,
  p_user_cost int default null
) returns table(allowed boolean, retry_after_seconds int, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_tokens numeric;
  v_bucket_at timestamptz;
  v_throttled timestamptz;
  v_hourly_budget numeric;
  v_capacity numeric;
  v_refill numeric;
  v_elapsed numeric;
  v_user_cost int := coalesce(p_user_cost, p_cost);
  v_user_count int;
  v_user_window timestamptz;
  v_window_age numeric;
begin
  -- Lock the singleton limiter row (create it on first use).
  select tokens, bucket_updated_at, throttled_until, hourly_budget
    into v_tokens, v_bucket_at, v_throttled, v_hourly_budget
  from meta_api_limiter where id = 1 for update;

  if not found then
    insert into meta_api_limiter(id, tokens, bucket_updated_at)
      values (1, p_capacity, v_now)
      on conflict (id) do nothing;
    v_tokens := p_capacity; v_bucket_at := v_now; v_throttled := null;
    v_hourly_budget := null;
  end if;

  -- Effective capacity: stored dynamic budget when set, else the caller default.
  v_capacity := coalesce(nullif(v_hourly_budget, 0), p_capacity);
  v_refill := v_capacity / 3600.0;

  -- 1) Circuit breaker — short-circuit while Meta is (or may be) blocking us.
  if v_throttled is not null and v_throttled > v_now then
    return query select false,
      greatest(1, ceil(extract(epoch from (v_throttled - v_now)))::int),
      'circuit_open'::text;
    return;
  end if;

  -- 2) Refill the app-wide token bucket from elapsed time.
  v_elapsed := greatest(0, extract(epoch from (v_now - v_bucket_at)));
  v_tokens := least(v_capacity, v_tokens + v_elapsed * v_refill);

  -- 3) Per-user fixed hourly window, counted in REFRESHES (v_user_cost), not
  --    HTTP calls.
  select call_count, window_start into v_user_count, v_user_window
  from meta_api_user_usage where user_id = p_user_id for update;

  if not found then
    insert into meta_api_user_usage(user_id, window_start, call_count)
      values (p_user_id, v_now, 0)
      on conflict (user_id) do nothing;
    v_user_count := 0; v_user_window := v_now;
  end if;

  v_window_age := extract(epoch from (v_now - v_user_window));
  if v_window_age >= 3600 then
    v_user_count := 0; v_user_window := v_now; v_window_age := 0;
  end if;

  -- A continuation page (v_user_cost = 0) never trips this, by design.
  if v_user_count + v_user_cost > p_user_cap then
    update meta_api_limiter
      set tokens = v_tokens, bucket_updated_at = v_now, updated_at = v_now
      where id = 1;
    return query select false,
      greatest(1, ceil(3600 - v_window_age)::int),
      'user_quota'::text;
    return;
  end if;

  -- 4) App-wide budget (token bucket), charged per real HTTP call.
  if v_tokens < p_cost then
    update meta_api_limiter
      set tokens = v_tokens, bucket_updated_at = v_now, updated_at = v_now
      where id = 1;
    return query select false,
      greatest(1, ceil((p_cost - v_tokens) / nullif(v_refill, 0))::int),
      'app_budget'::text;
    return;
  end if;

  -- Allowed: spend a token, and charge the user only for a new refresh.
  update meta_api_limiter
    set tokens = v_tokens - p_cost, bucket_updated_at = v_now, updated_at = v_now
    where id = 1;

  update meta_api_user_usage
    set call_count = v_user_count + v_user_cost, window_start = v_user_window
    where user_id = p_user_id;

  return query select true, 0, 'ok'::text;
end;
$$;

grant execute on function consume_meta_quota(uuid, int, numeric, numeric, int, int)
  to anon, authenticated, service_role;

-- The counter's unit just changed from "HTTP calls" to "refreshes", so existing
-- rows hold numbers on the old scale (up to 20× too high). Leaving them would
-- lock current users out for the remainder of their window against a cap that
-- is now much smaller in unit terms. Clear the in-flight windows once.
delete from meta_api_user_usage;
