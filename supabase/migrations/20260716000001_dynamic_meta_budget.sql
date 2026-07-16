-- Scale the shared app-wide budget with the userbase instead of a flat constant.
--
-- Meta's Business Discovery ceiling is ~200 calls/hour PER connected user, app
-- wide — so the real allowance GROWS as you add users. The limiter, however,
-- capped every deploy at a static META_HOURLY_BUDGET (160), which becomes the
-- bottleneck at scale: at 1000 users Meta allows ~200k/hour while we self-throttle
-- at 160. This stores a dynamic budget on the limiter row, recomputed by the
-- refresh cron from the live connected-user count, and consume_meta_quota reads
-- it in the same locked SELECT it already does (no extra round-trip on the hot
-- path). When unset it falls back to the caller-provided default, so behaviour is
-- unchanged until the cron populates it.

alter table meta_api_limiter
  add column if not exists hourly_budget numeric;  -- dynamic app-wide budget; null = use caller default

-- Set the dynamic budget (called by the refresh cron with a value scaled to the
-- connected-user count). Kept behind a SECURITY DEFINER fn like the other limiter
-- mutations.
create or replace function set_meta_hourly_budget(p_budget numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update meta_api_limiter
    set hourly_budget = greatest(1, p_budget), updated_at = now()
  where id = 1;
end;
$$;
grant execute on function set_meta_hourly_budget(numeric) to service_role;

-- Prefer the stored dynamic budget over the caller-provided default. Refill rate
-- is derived from the effective capacity so a full bucket always refills in an
-- hour regardless of how the budget scales.
create or replace function consume_meta_quota(
  p_user_id uuid,
  p_cost int,
  p_capacity numeric,
  p_refill_per_sec numeric,
  p_user_cap int
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

  -- 3) Per-user fixed hourly window.
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
    v_user_count := 0; v_user_window := v_now;
  end if;

  if v_user_count + p_cost > p_user_cap then
    update meta_api_limiter
      set tokens = v_tokens, bucket_updated_at = v_now, updated_at = v_now
      where id = 1;
    return query select false,
      greatest(1, ceil(3600 - v_window_age)::int),
      'user_quota'::text;
    return;
  end if;

  -- 4) App-wide budget (token bucket).
  if v_tokens < p_cost then
    update meta_api_limiter
      set tokens = v_tokens, bucket_updated_at = v_now, updated_at = v_now
      where id = 1;
    return query select false,
      greatest(1, ceil((p_cost - v_tokens) / nullif(v_refill, 0))::int),
      'app_budget'::text;
    return;
  end if;

  -- Allowed: spend a token and record the user's call.
  update meta_api_limiter
    set tokens = v_tokens - p_cost, bucket_updated_at = v_now, updated_at = v_now
    where id = 1;

  update meta_api_user_usage
    set call_count = v_user_count + p_cost, window_start = v_user_window
    where user_id = p_user_id;

  return query select true, 0, 'ok'::text;
end;
$$;

grant execute on function consume_meta_quota(uuid, int, numeric, numeric, int)
  to anon, authenticated, service_role;
