-- Free-text support notes an admin can attach to a user (e.g. "refunded on
-- 2026-07-01, see Stripe dispute"). Written/read only through the service-role
-- admin client behind the admin gate — RLS on with no policies, grants revoked
-- from browser roles (same lockdown as admin_audit_log).
create table if not exists admin_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  admin_id uuid not null references profiles(id),
  note text not null check (char_length(note) <= 4000),
  created_at timestamptz not null default now()
);

alter table admin_notes enable row level security;
-- No policies on purpose: reachable only through the service-role client.
revoke all on table admin_notes from anon, authenticated;

create index if not exists admin_notes_user_idx
  on admin_notes (user_id, created_at desc);
