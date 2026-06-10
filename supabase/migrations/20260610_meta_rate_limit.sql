-- Meta Graph API protection layer.
--
-- Business Discovery (the endpoint that powers reel sync) is governed by Meta's
-- APP-LEVEL "Platform Rate Limits": 200 × daily-active-users per rolling hour,
-- a single pool SHARED by every user connected to this Meta app. One user's
-- heavy sync can throttle everyone, and once Meta returns error code 4
-- ("Application request limit reached") the whole app is blocked — continuing
-- to call only extends the block.
--
-- This migration adds a shared, atomic guard:
--   1. A global token bucket so app-wide usage stays under a safe budget.
--   2. A per-user hourly cap so no single account can starve the shared pool.
--   3. A global circuit breaker that trips the moment Meta signals throttling.
--
-- State is tiny and global, so the tables are reachable only through the
-- SECURITY DEFINER functions below (RLS on, no policies = no direct access).

create table if not exists meta_api_limiter (
  id smallint primary key default 1 check (id = 1),
  tokens numeric not null default 160,        -- app-wide token bucket
  bucket_updated_at timestamptz not null default now(),
  throttled_until timestamptz,                -- circuit breaker: open while > now()
  app_usage_pct int not null default 0,       -- last observed worst-case X-App-Usage %
  updated_at timestamptz not null default now()
);

insert into meta_api_limiter (id) values (1) on conflict (id) do nothing;

create table if not exists meta_api_user_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null default now(),  -- start of the user's rolling hour
  call_count int not null default 0
);

alter table meta_api_limiter enable row level security;
alter table meta_api_user_usage enable row level security;
-- No policies on purpose: state is global app infrastructure, mutated only by
-- the SECURITY DEFINER functions (which run as the table owner and bypass RLS).

-- Pre-flight gate. Atomically refills the app bucket, enforces the per-user
-- hourly cap, honours the circuit breaker, and spends one token if allowed.
-- Returns allowed + a retry hint + the reason (for friendly messaging).
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
  v_elapsed numeric;
  v_user_count int;
  v_user_window timestamptz;
  v_window_age numeric;
begin
  -- Lock the singleton limiter row (create it on first use).
  select tokens, bucket_updated_at, throttled_until
    into v_tokens, v_bucket_at, v_throttled
  from meta_api_limiter where id = 1 for update;

  if not found then
    insert into meta_api_limiter(id, tokens, bucket_updated_at)
      values (1, p_capacity, v_now)
      on conflict (id) do nothing;
    v_tokens := p_capacity; v_bucket_at := v_now; v_throttled := null;
  end if;

  -- 1) Circuit breaker — short-circuit while Meta is (or may be) blocking us.
  if v_throttled is not null and v_throttled > v_now then
    return query select false,
      greatest(1, ceil(extract(epoch from (v_throttled - v_now)))::int),
      'circuit_open'::text;
    return;
  end if;

  -- 2) Refill the app-wide token bucket from elapsed time.
  v_elapsed := greatest(0, extract(epoch from (v_now - v_bucket_at)));
  v_tokens := least(p_capacity, v_tokens + v_elapsed * p_refill_per_sec);

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
      greatest(1, ceil((p_cost - v_tokens) / nullif(p_refill_per_sec, 0))::int),
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

-- Trip the global circuit breaker (and drain the bucket so we ramp back slowly).
-- Uses greatest() so a longer cooldown is never shortened by a later call.
create or replace function trip_meta_circuit(p_seconds int, p_usage int default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update meta_api_limiter
    set throttled_until = greatest(coalesce(throttled_until, now()),
                                   now() + make_interval(secs => greatest(1, p_seconds))),
        tokens = 0,
        bucket_updated_at = now(),
        app_usage_pct = coalesce(p_usage, app_usage_pct),
        updated_at = now()
  where id = 1;
end;
$$;

-- Record the latest observed X-App-Usage percentage (diagnostics / soft signal).
create or replace function record_meta_usage(p_usage int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update meta_api_limiter
    set app_usage_pct = p_usage, updated_at = now()
  where id = 1;
end;
$$;

grant execute on function consume_meta_quota(uuid, int, numeric, numeric, int)
  to anon, authenticated, service_role;
grant execute on function trip_meta_circuit(int, int) to anon, authenticated, service_role;
grant execute on function record_meta_usage(int) to anon, authenticated, service_role;
