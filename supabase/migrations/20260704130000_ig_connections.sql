-- Studio multi-account (roadmap X4). Moves the single research IG credential off
-- the `profiles.ig_*` columns into per-connection rows so a Studio user can
-- connect several IG accounts and switch which one drives Business Discovery /
-- sync / insights / auto-reply. Additive + back-compatible: `profiles.ig_*`
-- stays as the legacy/primary credential; the app fail-opens to it when this
-- table is empty/absent, so shipping the code before applying this migration is
-- safe (behaves exactly as today).
--
-- Token posture (H3 non-negotiable): mirrors social_connections — RLS owner
-- policies, then REVOKE all from browser roles and GRANT SELECT only on the
-- NON-token columns. The access_token / fb_page_access_token columns are never
-- readable by anon/authenticated; all token IO flows through the service-role
-- token-store module.

create table if not exists ig_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  ig_user_id text not null,
  username text,
  display_name text,
  avatar_url text,
  access_token text,                       -- SERVER ONLY
  token_expires_at timestamptz,
  token_status text not null default 'active',
  token_refreshed_at timestamptz,
  fb_page_id text,
  fb_page_name text,
  fb_page_access_token text,               -- SERVER ONLY
  webhook_subscribed_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, ig_user_id)
);

alter table ig_connections enable row level security;
create policy "Users can read own ig connections"
  on ig_connections for select using (auth.uid() = user_id);
create index ig_connections_user_idx on ig_connections (user_id);

-- Browser roles: metadata only, never the token columns.
revoke all on table ig_connections from anon, authenticated;
grant select (id, user_id, ig_user_id, username, display_name, avatar_url,
              token_status, token_expires_at, token_refreshed_at,
              fb_page_id, fb_page_name, webhook_subscribed_at,
              is_active, created_at, updated_at)
  on ig_connections to authenticated;

-- Pointer to the active research connection. NULL → fall back to profiles.ig_*.
alter table profiles
  add column if not exists active_ig_connection_id uuid
    references ig_connections(id) on delete set null;
grant select (active_ig_connection_id) on profiles to authenticated;

-- Backfill: every already-connected user gets one ig_connections row from their
-- current profiles credential, marked active. Preserves existing connections so
-- nothing has to reconnect after this migration.
insert into ig_connections (
  user_id, ig_user_id, username, display_name, avatar_url,
  access_token, token_expires_at, token_status, token_refreshed_at,
  fb_page_id, fb_page_name, fb_page_access_token, webhook_subscribed_at, is_active
)
select
  p.id, p.ig_user_id, p.username, p.username, p.avatar_url,
  p.ig_access_token, p.ig_token_expires_at, coalesce(p.ig_token_status, 'active'),
  p.ig_token_refreshed_at, p.fb_page_id, p.fb_page_name, p.fb_page_access_token,
  p.webhook_subscribed_at, true
from profiles p
where p.ig_access_token is not null and p.ig_user_id is not null
on conflict (user_id, ig_user_id) do nothing;

update profiles p
set active_ig_connection_id = c.id
from ig_connections c
where c.user_id = p.id
  and c.ig_user_id = p.ig_user_id
  and p.active_ig_connection_id is null;
