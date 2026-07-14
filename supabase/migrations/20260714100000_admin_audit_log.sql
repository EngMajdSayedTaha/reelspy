-- Admin audit log (append-only). Every mutating admin action writes one row
-- here via lib/admin/audit.ts, so support/ops actions are fully traceable:
-- who did what, to which target, with a jsonb payload (before/after snapshot,
-- reason, etc.). Service-role only — RLS on with NO policies and grants revoked
-- from the browser roles, same lockdown as app_settings / jobs.
--
-- Append-only by convention: there is no update/delete code path, and the DB
-- grants below deny both to anon/authenticated. The service-role client bypasses
-- RLS but the app never issues UPDATE/DELETE against this table.
create table if not exists admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references profiles(id),
  action text not null,           -- e.g. 'user.ban', 'user.tier', 'content.delete'
  target_type text not null,      -- e.g. 'user', 'subscription', 'job', 'content:tracked_reels'
  target_id text,                 -- id of the affected row (uuid/text/bigint, stored as text)
  payload jsonb not null default '{}'::jsonb,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table admin_audit_log enable row level security;
-- No policies on purpose: reachable only through the service-role client.
revoke all on table admin_audit_log from anon, authenticated;

create index if not exists admin_audit_log_created_idx
  on admin_audit_log (created_at desc);
create index if not exists admin_audit_log_target_idx
  on admin_audit_log (target_type, target_id);
create index if not exists admin_audit_log_admin_idx
  on admin_audit_log (admin_id, created_at desc);
