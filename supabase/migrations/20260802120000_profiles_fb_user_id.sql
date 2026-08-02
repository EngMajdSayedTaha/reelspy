-- Meta platform callbacks (Deauthorize + Data Deletion) identify the user by
-- the FACEBOOK APP-SCOPED USER ID (ASID) carried in `signed_request.user_id`.
--
-- Nothing in the schema held that value: the connect flow stores
-- `profiles.ig_user_id` (the Instagram BUSINESS ACCOUNT id) and the access
-- token, neither of which Meta sends to a platform callback. So a deauthorize
-- POST arrived with a user id we had no way to resolve, and the callback could
-- do nothing but return 200 — which is exactly the "callback is a stub" finding
-- that fails App Review.
--
-- Advanced Access requires both callbacks to genuinely work, so this column is
-- a prerequisite for the review submission (see Plan_Reelspy/09-platform-access.md).
--
-- The ASID is not a secret (it is app-scoped and useless without the app
-- secret), so unlike the token columns it needs no grant lockdown — the
-- 20260611_lock_down_ig_tokens.sql posture is deliberately not extended here.

alter table profiles
  add column if not exists fb_user_id text;

-- The callbacks look users up BY this column, on an unauthenticated request
-- path, so it must not be a sequential scan over every profile.
create index if not exists profiles_fb_user_id_idx
  on profiles (fb_user_id)
  where fb_user_id is not null;

comment on column profiles.fb_user_id is
  'Facebook app-scoped user ID (ASID) from the OAuth token exchange. Used only to resolve Meta deauthorize / data-deletion callbacks back to a ReelSpy user.';
