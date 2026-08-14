-- Lock down SECURITY DEFINER RPCs that Postgres left executable by PUBLIC.
--
-- THE BUG
-- -------
-- Postgres grants EXECUTE on every new function to PUBLIC by default. A
-- `revoke ... from anon, authenticated` does NOT remove that default grant, and
-- both roles are members of PUBLIC — so the lockdown in
-- 20260611000000_lock_down_ig_tokens.sql (lines 33-35) was a no-op, and these
-- functions stayed callable by anyone holding the anon key. That key ships in
-- the browser bundle by design, so "anyone" means unauthenticated, via
-- POST /rest/v1/rpc/<name>. 20260703000003_billing.sql got this right
-- (`from public, anon`); the meta and waitlist migrations did not.
--
-- IMPACT — every one of these was reachable with nothing but the public key:
--   set_meta_hourly_budget(1)         throttle Instagram sync app-wide, for every user
--   trip_meta_circuit(315360000, …)   hold the global circuit breaker open for 10 years
--   record_meta_usage(…)              poison the telemetry the limiter reads
--   consume_meta_quota(…)             drain the shared Meta token bucket
--   consume_anon_action(…)            burn the waitlist anti-abuse buckets
--   consume_user_action(other_id, …)  burn ANOTHER user's hourly AI/transcript quota
--
-- The four meta functions and consume_anon_action are only ever called through
-- the service-role client (verified: every createMetaRateLimiter call site and
-- consumeAnonAction call passes `admin`), so they lose anon + authenticated
-- outright. consume_user_action must stay callable by `authenticated` — the app
-- calls it on the user's own RLS-scoped client — so it is bound to the caller's
-- identity instead. See the second block below.

-- ── 1. Service-role-only RPCs ────────────────────────────────────────────────
-- Done as a loop over pg_proc rather than a list of literal signatures: several
-- of these have been re-created with new signatures over time (consume_meta_quota
-- gained p_user_cost in 20260728000000) and older overloads may or may not still
-- exist in a given environment. A plain `revoke` on a signature that isn't there
-- aborts the whole migration; this revokes every overload that actually exists
-- and skips the rest, so the migration is safe to run against any state.
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'set_meta_hourly_budget',
        'trip_meta_circuit',
        'record_meta_usage',
        'consume_meta_quota',
        'consume_anon_action'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn.sig);
    execute format('grant execute on function %s to service_role', fn.sig);
  end loop;
end;
$$;

-- ── 2. consume_user_action: bind to the caller ───────────────────────────────
-- `authenticated` keeps EXECUTE (the app calls this on the user's own client),
-- but p_user_id may no longer be an arbitrary id: without this, any signed-in
-- user could POST consume_user_action(<victim_id>, 'generate_script', 1, 3600)
-- in a loop and exhaust a victim's hourly quota for scripts, transcripts and
-- uploads.
--
-- auth.uid() is null for the service-role client (its JWT carries no `sub`),
-- which is what lets the server keep consuming on behalf of any user — see
-- lib/media/transcribe-job.ts and app/api/ig/archive/route.ts, both of which
-- pass the admin client with a userId that isn't the caller's.
--
-- Body is otherwise unchanged from 20260626000002_user_action_rate_limit.sql.
create or replace function consume_user_action(
  p_user_id uuid,
  p_action text,
  p_limit int,
  p_window_seconds int
) returns table(allowed boolean, retry_after_seconds int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_count int;
  v_window timestamptz;
  v_age numeric;
begin
  -- Schema-qualified on purpose: search_path is pinned to `public` above, so an
  -- unqualified uid() would not resolve.
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'consume_user_action: cannot consume another user''s quota'
      using errcode = '42501';
  end if;

  select call_count, window_start into v_count, v_window
  from user_action_usage
  where user_id = p_user_id and action = p_action
  for update;

  if not found then
    insert into user_action_usage(user_id, action, window_start, call_count)
      values (p_user_id, p_action, v_now, 0)
      on conflict (user_id, action) do nothing;
    v_count := 0; v_window := v_now;
  end if;

  v_age := extract(epoch from (v_now - v_window));
  if v_age >= p_window_seconds then
    v_count := 0; v_window := v_now;
  end if;

  if v_count + 1 > p_limit then
    return query select false,
      greatest(1, ceil(p_window_seconds - v_age)::int);
    return;
  end if;

  update user_action_usage
    set call_count = v_count + 1, window_start = v_window
    where user_id = p_user_id and action = p_action;

  return query select true, 0;
end;
$$;

revoke all on function consume_user_action(uuid, text, int, int) from public, anon;
grant execute on function consume_user_action(uuid, text, int, int)
  to authenticated, service_role;

-- ── 3. consume_user_action_monthly: same binding ─────────────────────────────
-- 20260703000003_billing.sql correctly revoked PUBLIC here, so this one was
-- never anon-reachable — but `authenticated` can still pass someone else's id
-- and burn their MONTHLY plan quota (scripts_mo / transcripts_mo), which is a
-- worse outcome than the hourly bucket: it doesn't roll off for weeks.
--
-- Body copied verbatim from the live definition (pg_get_functiondef); the guard
-- is the only addition.
create or replace function consume_user_action_monthly(
  p_user_id uuid,
  p_action text,
  p_limit integer
) returns table(allowed boolean, used integer, remaining integer, period_end timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_period date := date_trunc('month', now() at time zone 'utc')::date;
  v_end timestamptz := ((v_period + interval '1 month')::timestamp at time zone 'utc');
  v_count int;
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'consume_user_action_monthly: cannot consume another user''s quota'
      using errcode = '42501';
  end if;

  select call_count into v_count
  from user_monthly_usage
  where user_id = p_user_id and action = p_action and period_month = v_period
  for update;

  if not found then
    insert into user_monthly_usage(user_id, action, period_month, call_count)
      values (p_user_id, p_action, v_period, 0)
      on conflict (user_id, action, period_month) do nothing;
    v_count := 0;
  end if;

  if p_limit >= 0 and v_count + 1 > p_limit then
    return query select false, v_count, 0, v_end;
    return;
  end if;

  update user_monthly_usage
    set call_count = v_count + 1
    where user_id = p_user_id and action = p_action and period_month = v_period;

  return query select
    true,
    v_count + 1,
    case when p_limit < 0 then -1 else greatest(0, p_limit - (v_count + 1)) end,
    v_end;
end;
$$;

revoke all on function consume_user_action_monthly(uuid, text, int) from public, anon;
grant execute on function consume_user_action_monthly(uuid, text, int)
  to authenticated, service_role;

-- ── 4. Trigger-only functions ────────────────────────────────────────────────
-- handle_new_user() (returns trigger) and rls_auto_enable() (returns
-- event_trigger) are flagged by the linter as PUBLIC-executable. Neither is
-- actually callable through PostgREST — it does not expose trigger-returning
-- functions, and both fail immediately outside a trigger context (NEW unbound /
-- pg_event_trigger_ddl_commands() unavailable). Revoked anyway so the surface is
-- provably empty rather than merely impractical.
--
-- SAFE FOR THE TRIGGERS: Postgres checks EXECUTE on a trigger function when the
-- trigger is CREATED, not each time it fires. Revoking here does not stop signup
-- from provisioning a profile, and does not stop rls_auto_enable from enabling
-- RLS on new tables — both are verified after this migration runs.
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('handle_new_user', 'rls_auto_enable')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn.sig);
  end loop;
end;
$$;

-- ── 5. Pin a mutable search_path ─────────────────────────────────────────────
-- SECURITY INVOKER, so the risk is small, but an unpinned search_path on a
-- trigger function is a standard hardening gap. The body only calls now()
-- (pg_catalog, always implicitly in scope), so an empty search_path is safe.
create or replace function waitlist_entries_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
