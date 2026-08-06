-- Waiting list (closed-beta gate).
--
-- Two things live here:
--
--   1. `waitlist_entries` — one row per person who asked for access, whether
--      they arrived from the marketing site (anonymous email capture) or by
--      actually signing up (Google/email, which creates an auth user first and
--      then gets parked on the pending screen). Keyed by normalized email so
--      the two paths converge on ONE row: someone who joined from the landing
--      page and later signs up with the same address is the same applicant, not
--      two.
--
--   2. `anon_action_usage` + `consume_anon_action` — a fixed-window throttle
--      keyed by an opaque bucket string rather than a user id, because the
--      landing form is unauthenticated. Mirrors consume_user_action (see
--      20260626000002_user_action_rate_limit.sql) exactly; the only difference
--      is what the key means. The app passes a salted SHA-256 of the client IP,
--      never the IP itself.
--
-- The waitlist is switched on/off entirely through the `flag:waitlist` row in
-- app_settings — no redeploy, no env var. An ABSENT row means OFF, so this
-- migration deliberately seeds nothing: applying it changes no behaviour.

-- ---------------------------------------------------------------------------
-- Entries
-- ---------------------------------------------------------------------------

create table if not exists waitlist_entries (
  id uuid primary key default gen_random_uuid(),

  -- Always stored lowercased+trimmed by the app; the functional unique index
  -- below is the real guarantee, so a direct SQL insert can't create a
  -- case-variant duplicate either.
  email text not null,

  -- Ties an entry to an account once the person actually signs up. Nullable:
  -- most landing-page entries never have one. ON DELETE SET NULL so deleting a
  -- test account doesn't silently drop the applicant from the queue.
  user_id uuid unique references auth.users(id) on delete set null,

  -- Where the row came from: 'landing' (marketing form), 'signup' (created
  -- because a signed-in user hit the gate), 'admin' (added by hand).
  source text not null default 'landing',

  status text not null default 'pending'
    check (status in ('pending', 'invited', 'approved', 'rejected')),

  -- Stable join order. Named queue_number rather than "position" because
  -- position() is a built-in function and the column reads badly in queries.
  -- Monotonic, never reused — this is what the pending screen shows as "#47".
  queue_number bigint generated always as identity,

  -- Qualification fields. All optional: every extra required field costs
  -- conversion, and the founder can always ask later. They exist so the review
  -- queue can be prioritized by fit (a 50k-follower fitness creator before an
  -- empty account) instead of first-come-first-served.
  name text,
  instagram_handle text,
  niche text,
  follower_range text,
  referral_source text,
  note text,

  -- Provenance / attribution, for judging channel quality later.
  locale text,
  utm jsonb not null default '{}'::jsonb,
  -- Salted SHA-256 hex of the submitting IP (see lib/waitlist/hash.ts). Kept
  -- for abuse forensics only; the raw IP is never stored, so this is not
  -- personal data that has to be surfaced in a PDPL export.
  ip_hash text,
  user_agent text,

  -- Review state.
  admin_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  invited_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The identity that actually enforces "one applicant, one row".
create unique index if not exists waitlist_entries_email_key
  on waitlist_entries (lower(email));

-- The review queue's default view: newest first, filtered by status.
create index if not exists waitlist_entries_status_created_idx
  on waitlist_entries (status, created_at desc);
create index if not exists waitlist_entries_created_idx
  on waitlist_entries (created_at desc);

-- RLS on with NO policies, same posture as app_settings / app_events: these
-- rows carry other people's email addresses, so they are reachable only through
-- the service-role client behind the admin gate or a server route. Belt on top
-- of RLS in case a policy is ever added by accident:
alter table waitlist_entries enable row level security;
revoke all on table waitlist_entries from anon, authenticated;

create or replace function waitlist_entries_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists waitlist_entries_updated_at on waitlist_entries;
create trigger waitlist_entries_updated_at
  before update on waitlist_entries
  for each row execute function waitlist_entries_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Anonymous throttle
-- ---------------------------------------------------------------------------

create table if not exists anon_action_usage (
  bucket text not null,
  action text not null,
  window_start timestamptz not null default now(),
  call_count int not null default 0,
  primary key (bucket, action)
);

alter table anon_action_usage enable row level security;
-- No policies: mutated only through the SECURITY DEFINER function below.

-- Atomically enforce a fixed-window quota for an unauthenticated caller.
-- Identical semantics to consume_user_action, keyed by an opaque bucket.
create or replace function consume_anon_action(
  p_bucket text,
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
  from anon_action_usage
  where bucket = p_bucket and action = p_action
  for update;

  if not found then
    insert into anon_action_usage(bucket, action, window_start, call_count)
      values (p_bucket, p_action, v_now, 0)
      on conflict (bucket, action) do nothing;
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

  update anon_action_usage
    set call_count = v_count + 1, window_start = v_window
    where bucket = p_bucket and action = p_action;

  return query select true, 0;
end;
$$;

-- Only the server calls this (service-role); anon/authenticated never touch it
-- directly, so no grant to those roles.
grant execute on function consume_anon_action(text, text, int, int) to service_role;

-- Old rows are pure garbage after their window closes. No pg_cron dependency:
-- the app opportunistically prunes, and this index makes that cheap.
create index if not exists anon_action_usage_window_idx
  on anon_action_usage (window_start);
