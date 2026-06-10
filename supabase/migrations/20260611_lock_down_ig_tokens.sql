-- Security hardening: keep Instagram tokens out of reach of browser clients,
-- and stop anonymous callers from manipulating the shared rate limiter.
--
-- 1) profiles.ig_access_token is a long-lived Meta user token (~60 days of
--    access to the creator's Pages/IG data). The RLS policy correctly limits
--    rows to the owner, but column-wise the owner's own BROWSER session could
--    still `select ig_access_token` — meaning any XSS (or malicious browser
--    extension) could exfiltrate the token in one query. The app now reads and
--    writes the token exclusively through the service-role client
--    (lib/instagram/token-store.ts), so client roles get column-level grants
--    that exclude every token/credential column.
--
-- 2) The meta_api_* SECURITY DEFINER functions were executable by `anon`:
--    anyone holding the public anon key could call trip_meta_circuit(86400)
--    and lock every user out of syncing for a day. They are server-only now.

-- ── profiles: column-level privileges ───────────────────────────────────────

revoke all on table profiles from anon;
revoke all on table profiles from authenticated;

-- Browser/user-JWT clients can see connection METADATA (enough for every UI
-- state: connected, expiring, needs-reconnect) but never the token itself.
grant select (id, username, ig_user_id, ig_token_status, ig_token_expires_at, ig_token_refreshed_at, created_at)
  on profiles to authenticated;

-- Profile bootstrap from the auth callback (id + username only).
grant insert (id, username) on profiles to authenticated;
grant update (username) on profiles to authenticated;

-- ── rate limiter RPCs: server-only ──────────────────────────────────────────

revoke execute on function consume_meta_quota(uuid, int, numeric, numeric, int) from anon, authenticated;
revoke execute on function trip_meta_circuit(int, int) from anon, authenticated;
revoke execute on function record_meta_usage(int) from anon, authenticated;
