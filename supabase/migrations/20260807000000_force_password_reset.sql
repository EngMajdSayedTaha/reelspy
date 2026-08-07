-- Admin-forced password reset. When force_password_reset is true, the app
-- (middleware.ts) blocks the dashboard surface until the user sets a new
-- password, regardless of any still-valid session — see
-- app/api/admin/users/[id]/force-reset/route.ts and
-- app/api/admin/users/force-reset-all/route.ts. Read-only to the authenticated
-- role, same lockdown as is_admin (migration profile_is_admin): only
-- service-role/SQL can write it, so a user can never clear their own flag by
-- calling the profiles table directly — clearing happens exclusively via
-- app/api/auth/clear-forced-reset/route.ts after a verified password change.
alter table profiles add column force_password_reset boolean not null default false;
alter table profiles add column force_password_reset_at timestamptz;
alter table profiles add column force_password_reset_reason text;
grant select (force_password_reset, force_password_reset_at, force_password_reset_reason)
  on profiles to authenticated;

-- GoTrue exposes no admin API to revoke an arbitrary user's still-valid access
-- token (only `auth.signOut(jwt)`, which needs that user's own token). The
-- documented workaround is deleting their rows from auth.sessions, which
-- breaks refresh and forces a fresh sign-in. auth.sessions isn't in
-- PostgREST's exposed schema list, so it's unreachable from the service-role
-- REST client directly — these SECURITY DEFINER functions (owned by the
-- migration role, which has auth-schema access) bridge that gap. Execute is
-- granted to service_role only, so nothing but the admin API surface can call
-- them.
create or replace function public.admin_revoke_user_sessions(target_user uuid)
returns void
language plpgsql
security definer
set search_path = auth, public
as $$
begin
  delete from auth.sessions where user_id = target_user;
end;
$$;

revoke all on function public.admin_revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.admin_revoke_user_sessions(uuid) to service_role;

-- Bulk variant for "reset all" — exclude_user_id lets the acting admin keep
-- their own live session instead of being logged out mid-operation (their
-- profile is still flagged like everyone else's; they just aren't yanked out
-- immediately).
create or replace function public.admin_revoke_all_sessions(exclude_user_id uuid default null)
returns void
language plpgsql
security definer
set search_path = auth, public
as $$
begin
  if exclude_user_id is null then
    delete from auth.sessions;
  else
    delete from auth.sessions where user_id <> exclude_user_id;
  end if;
end;
$$;

revoke all on function public.admin_revoke_all_sessions(uuid) from public, anon, authenticated;
grant execute on function public.admin_revoke_all_sessions(uuid) to service_role;
