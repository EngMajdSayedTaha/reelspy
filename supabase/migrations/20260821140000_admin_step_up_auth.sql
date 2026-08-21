-- Step-up ("sudo mode") authentication for the admin control panel.
--
-- Before this, `profiles.is_admin` alone opened the whole panel: anyone holding
-- a founder browser session — a stolen cookie, an unlocked laptop, a hijacked
-- Google session — inherited read access to every customer's data plus refunds,
-- bans and force-reset-all. A boolean is an AUTHORIZATION fact ("this person may
-- administer"); it was doing the job of an AUTHENTICATION fact ("this request
-- really is that person, right now"). These two tables add the missing second
-- factor.
--
--   admin_credentials — one admin passphrase per admin, separate from the
--     account password and never stored in plaintext (scrypt, per-row salt; see
--     lib/admin/passphrase.ts). Also carries the brute-force state (failed
--     attempts + lockout) and the one-time enrollment ticket used to bootstrap
--     or reset a passphrase OUT OF BAND (scripts/admin-passphrase.mjs), so a
--     stolen session can never enroll its own passphrase and elevate itself.
--
--   admin_sessions — the short-lived elevation granted by entering that
--     passphrase. The cookie carries a random token; only its SHA-256 hash is
--     stored, so a database leak cannot mint elevation. Rows expire on an
--     absolute deadline AND on idle, can be revoked individually, and record
--     `reauth_at` — the last time the passphrase was actually typed — which is
--     what the critical-action re-auth window is measured against.
--
-- Both are service-role only (RLS on with NO policies + browser grants revoked),
-- the same lockdown as admin_audit_log / app_settings: nothing here is ever
-- readable through the anon key, even by the admin it belongs to.

create table if not exists admin_credentials (
  user_id uuid primary key references profiles(id) on delete cascade,
  -- "scrypt$N$r$p$<salt-b64>$<hash-b64>" — self-describing so the cost
  -- parameters can be raised later without invalidating existing rows.
  -- Nullable: a row can exist carrying only an enrollment ticket (the admin has
  -- been invited to set a passphrase but hasn't yet).
  passphrase_hash text,
  passphrase_set_at timestamptz,
  -- Brute-force state. Cleared on every successful verification.
  failed_attempts int not null default 0,
  last_failed_at timestamptz,
  locked_until timestamptz,
  -- One-time enrollment/reset ticket, minted out of band by the CLI. Stored as
  -- a SHA-256 hash for the same reason session tokens are.
  enrollment_hash text,
  enrollment_expires_at timestamptz,
  enrollment_created_at timestamptz,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table admin_credentials enable row level security;
-- No policies on purpose: reachable only through the service-role client.
revoke all on table admin_credentials from anon, authenticated;

create table if not exists admin_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references profiles(id) on delete cascade,
  -- SHA-256 (hex) of the opaque token held in the httpOnly cookie.
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  -- Last time the passphrase itself was entered on this session. Critical
  -- actions (grant admin, refund, force-reset-all, …) require this to be RECENT,
  -- independent of how long the elevation itself is still valid for.
  reauth_at timestamptz not null default now(),
  -- Idle timeout anchor, touched (at most once a minute) by the gate.
  last_seen_at timestamptz not null default now(),
  -- Absolute deadline: an elevation always dies at this point, active or not.
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_reason text,
  ip text,
  user_agent text
);

alter table admin_sessions enable row level security;
-- No policies on purpose: reachable only through the service-role client.
revoke all on table admin_sessions from anon, authenticated;

-- Lookup path for the gate (token → live session) and for the "active sessions"
-- list on /admin/security.
create index if not exists admin_sessions_admin_idx
  on admin_sessions (admin_id, created_at desc);
-- Supports the opportunistic prune of dead rows.
create index if not exists admin_sessions_expires_idx
  on admin_sessions (expires_at);
