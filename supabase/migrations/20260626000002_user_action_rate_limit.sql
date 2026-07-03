-- Per-user throttle for expensive user-triggered actions (AI script generation,
-- growth notes, transcription). Unlike the Meta limiter — which guards a shared
-- APP-level pool — this simply stops one signed-in user from looping an endpoint
-- and burning Anthropic/Groq quota. State is per (user, action), fixed window.
--
-- Reachable only through the SECURITY DEFINER RPC below (RLS on, no policies).

create table if not exists user_action_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  window_start timestamptz not null default now(),
  call_count int not null default 0,
  primary key (user_id, action)
);

alter table user_action_usage enable row level security;
-- No policies: mutated only by the SECURITY DEFINER function below.

-- Atomically enforce a fixed-window quota and, if allowed, record the call.
-- Returns allowed + seconds until the window resets (for friendly messaging).
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

grant execute on function consume_user_action(uuid, text, int, int)
  to authenticated, service_role;
