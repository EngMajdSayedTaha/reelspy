-- Make the "Shared app pool %" gauge reflect reality instead of a frozen peak.
--
-- meta_api_limiter.app_usage_pct stored the LAST X-App-Usage % Meta reported and
-- was only ever written up — never decayed. So a morning burst that hit 92% left
-- the gauge stuck at 92% for the rest of the day, long after Meta's rolling-hour
-- usage had drained back down, because the value only refreshes on the next real
-- Business Discovery call. Users with a fresh per-user window (0/N this hour) and
-- a closed circuit breaker saw an alarming number that no longer meant anything.
--
-- Fix: stamp WHEN the usage % was observed, so the read path can decay it toward
-- 0 across Meta's rolling hour. consume_meta_quota deliberately does NOT touch
-- this stamp — a token spend is a pre-flight gate, not a fresh observation, so it
-- must not reset the decay clock and re-freeze the stale peak.

alter table meta_api_limiter
  add column if not exists app_usage_at timestamptz not null default now();

-- Record the latest observed X-App-Usage percentage, stamping the observation
-- time so the reader can age it out.
create or replace function record_meta_usage(p_usage int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update meta_api_limiter
    set app_usage_pct = p_usage, app_usage_at = now(), updated_at = now()
  where id = 1;
end;
$$;

-- Trip the global circuit breaker. When it carries a fresh usage reading
-- (p_usage is not null) stamp the observation time too; otherwise leave the
-- existing app_usage_pct / app_usage_at untouched.
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
        app_usage_at = case when p_usage is not null then now() else app_usage_at end,
        updated_at = now()
  where id = 1;
end;
$$;

-- Age out the current stored peak so it starts decaying from now rather than
-- pretending the morning reading is live.
update meta_api_limiter set app_usage_at = now() where id = 1;
