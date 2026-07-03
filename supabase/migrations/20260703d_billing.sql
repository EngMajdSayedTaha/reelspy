-- Stripe billing (L6 / B1). One subscription row per user, written ONLY by the
-- signature-verified Stripe webhook (via the service-role client). Users may
-- READ their own row so the billing page + sidebar tier badge can render; they
-- can never write it (no insert/update/delete policy — the webhook is the sole
-- source of truth). Tier + status here drive both AI model routing (W2, see
-- lib/ai/tier.ts) and feature entitlements (lib/billing/entitlements.ts).
--
-- Fail-open posture everywhere: until this migration is applied the app treats a
-- missing subscriptions table / RPC as "no paid sub" and falls back to the env
-- default tier — same as the rate-limiter, so a feature never hard-breaks on
-- billing infra that isn't provisioned yet.

create table if not exists subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  tier text not null default 'free',      -- 'free' | 'creator' | 'pro' | 'studio'
  status text not null default 'inactive',-- Stripe sub status: active|trialing|past_due|canceled|...
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Look up a subscription by Stripe customer id inside the webhook (which only
-- carries the customer, not our user id, on some events).
create index if not exists subscriptions_stripe_customer_idx
  on subscriptions (stripe_customer_id);

alter table subscriptions enable row level security;

-- Read-only for the owner; the webhook (service-role) bypasses RLS to write.
drop policy if exists "Users can read own subscription" on subscriptions;
create policy "Users can read own subscription"
  on subscriptions for select using (auth.uid() = user_id);

-- Browser roles get SELECT only — no insert/update/delete grants at all, so even
-- a policy slip can't let a client forge a tier.
revoke all on table subscriptions from anon, authenticated;
grant select on table subscriptions to authenticated;

-- ── Monthly usage quota (calendar-month window) ──────────────────────────────
-- The hourly consume_user_action (20260626c) stops loops; this one enforces the
-- per-tier MONTHLY caps from entitlements (scripts/mo, transcripts/mo). Keyed on
-- the first day of the current UTC month so it resets cleanly each month.
create table if not exists user_monthly_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  period_month date not null,             -- first day of the month (UTC)
  call_count int not null default 0,
  primary key (user_id, action, period_month)
);

alter table user_monthly_usage enable row level security;
-- No policies: mutated only by the SECURITY DEFINER function below.

-- Atomically enforce a per-calendar-month quota and, if allowed, record the use.
-- p_limit < 0 means UNLIMITED (studio scripts/transcripts): the call is always
-- allowed and still counted (so usage stays observable). Returns the running
-- count and how many remain (-1 when unlimited) plus when the window resets.
create or replace function consume_user_action_monthly(
  p_user_id uuid,
  p_action text,
  p_limit int
) returns table(allowed boolean, used int, remaining int, period_end timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period date := date_trunc('month', now() at time zone 'utc')::date;
  v_end timestamptz := ((v_period + interval '1 month')::timestamp at time zone 'utc');
  v_count int;
begin
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

  -- Enforce the cap unless unlimited (negative limit).
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

grant execute on function consume_user_action_monthly(uuid, text, int)
  to authenticated, service_role;
