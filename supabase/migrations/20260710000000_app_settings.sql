-- Service-role-only key/value store for app infrastructure state.
--
-- First use: Instagram cookies for the yt-dlp transcript pipeline (key
-- 'ig_cookies'), so the founder can rotate cookies at runtime — via
-- POST /api/admin/ig-cookies — without a Vercel redeploy, and so the
-- pipeline can persist the session cookies Instagram rotates on every
-- request (yt-dlp writes them back to the cookie file it's given).
--
-- The 'ig_cookies' row's jsonb value carries (see lib/media/ig-cookies.ts):
--   cookies_b64, updated_by ("admin-api" | "write-back" | "env-seed"),
--   last_ok_at, last_error, last_error_at, last_alert_at, rotations

create table if not exists app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table app_settings enable row level security;
-- No policies on purpose (same pattern as meta_api_limiter): rows hold app
-- infrastructure secrets, reachable only through the service-role client.
-- Defense in depth on top of RLS:
revoke all on table app_settings from anon, authenticated;
