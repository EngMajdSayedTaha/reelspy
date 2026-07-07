-- Admin flag (founder-only bypass of all plan entitlements). Read-only to the
-- authenticated role; only service-role/SQL can set it, so a user can never
-- self-promote via the app.
alter table profiles add column is_admin boolean not null default false;
grant select (is_admin) on profiles to authenticated;
