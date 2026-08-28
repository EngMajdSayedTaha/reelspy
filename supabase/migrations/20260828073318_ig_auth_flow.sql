-- Instagram now supports TWO OAuth flows into the same `profiles`/`ig_connections`
-- credential columns:
--   'facebook_login'  — Facebook Login for Business (graph.facebook.com). Requires
--                        the Instagram account to be linked to a Facebook Page.
--                        The only flow that supports Business Discovery (competitor
--                        research). Existing behavior, kept as the default.
--   'instagram_login' — "Instagram API with Instagram Login" (graph.instagram.com).
--                        No Facebook Page required — the fix for creators whose
--                        Instagram Business/Creator account has no linked Page.
--                        Cannot use Business Discovery; publishing/insights/own-
--                        account reads work on graph.instagram.com instead.
--
-- A token from one flow is NOT valid against the other host — Meta treats them
-- as different app audiences. Every place that picks a Graph host for a stored
-- token (lib/meta/graph.ts graphBaseForAuthFlow, the shared Business-Discovery
-- viewer picker, the token-refresh cron) needs to know which flow produced it,
-- hence this column rather than inferring it from, say, fb_page_id being null.

alter table profiles
  add column if not exists ig_auth_flow text not null default 'facebook_login';

alter table profiles
  add constraint profiles_ig_auth_flow_check
  check (ig_auth_flow in ('facebook_login', 'instagram_login'));

comment on column profiles.ig_auth_flow is
  'Which Meta OAuth flow produced the stored ig_access_token: facebook_login (graph.facebook.com, needs a linked FB Page) or instagram_login (graph.instagram.com, standalone IG Business/Creator account, no Page).';

alter table ig_connections
  add column if not exists auth_flow text not null default 'facebook_login';

alter table ig_connections
  add constraint ig_connections_auth_flow_check
  check (auth_flow in ('facebook_login', 'instagram_login'));

comment on column ig_connections.auth_flow is
  'Same discriminator as profiles.ig_auth_flow, for the multi-account (Studio X4) connection rows.';
