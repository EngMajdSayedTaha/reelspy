-- Fix: "permission denied for table profiles" on Google sign-in, and make
-- profile creation bulletproof regardless of the browser role's privileges.
--
-- Background: 20260611_lock_down_ig_tokens.sql revoked table privileges on
-- profiles and re-granted only column-level INSERT(id, username) +
-- UPDATE(username) to `authenticated`. The auth callback's upsert compiled to
-- `INSERT ... ON CONFLICT (id) DO UPDATE SET id=…, username=…`, and Postgres
-- checks UPDATE privilege on EVERY SET column at plan time — even when no
-- conflict occurs. `id` had no UPDATE grant, so every sign-in failed.
--
-- This migration removes the dependency on the browser role entirely by
-- creating the profile row at signup with a SECURITY DEFINER trigger (runs as
-- the table owner, bypassing RLS + column grants), backfills any pre-existing
-- users, and re-asserts safe bootstrap privileges. Idempotent — safe to re-run.

-- ── 1) Auto-create the profile when an auth user is created ──────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── 2) Backfill: users who signed up before this trigger existed ─────────────
insert into public.profiles (id, username)
select u.id, u.email
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

-- ── 3) Re-assert safe bootstrap privileges ───────────────────────────────────
-- update(id) is safe: the "manage own profile" RLS policy constrains every
-- write to auth.uid() = id, so a user can never repoint a row to another id.
-- This lets BOTH the new (ON CONFLICT DO NOTHING) and old (DO UPDATE) callback
-- code succeed. Token/credential columns remain ungranted (server-only).
grant select (id, username, ig_user_id, ig_token_status, ig_token_expires_at, ig_token_refreshed_at, created_at)
  on public.profiles to authenticated;
grant insert (id, username) on public.profiles to authenticated;
grant update (id, username) on public.profiles to authenticated;

-- ── 4) Make the RLS insert/update check explicit ─────────────────────────────
drop policy if exists "Users can manage own profile" on public.profiles;
create policy "Users can manage own profile"
  on public.profiles for all
  using (auth.uid() = id)
  with check (auth.uid() = id);
