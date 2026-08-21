# Admin access & step-up authentication

How the ReelSpy control panel decides that the person in front of it is really
you — and what to do when it decides wrong.

---

## The problem this solves

Until now, one boolean opened the entire panel:

```sql
select is_admin from profiles where id = auth.uid();  -- true → you're in
```

`is_admin` is an **authorization** fact: *this person may administer*. It is
permanent, it is set out of band, and that part is fine. What it is not is an
**authentication** fact: *the request in front of us really is that person,
right now*. A signed-in session is all it ever asked for, and sessions leak in
mundane ways — an unlocked laptop, a phone left on a table, a session cookie
lifted from a browser, a Google account someone else can already get into.

Any of those used to mean: every customer's email and data, every subscription,
refunds, bans, and a one-click "force a password reset on all users".

So the panel now asks for a **second, independent secret** — an admin
passphrase — and holds the resulting access for a bounded time. `is_admin` still
decides *who may*; the passphrase decides *who is, right now*.

---

## The model in one page

| | |
|---|---|
| **Passphrase** | Separate from your account password. scrypt-hashed (N=32768, r=8, p=1), per-row salt, never stored, logged, emailed or recoverable in the clear. `admin_credentials`. |
| **Elevation** | What entering it buys: one row in `admin_sessions` + an opaque token in an httpOnly, `SameSite=Strict` cookie. The DB stores only the token's SHA-256, so a database leak cannot mint access. |
| **Absolute expiry** | 8h by default. An elevation always dies here, in use or not. |
| **Idle timeout** | 30 min by default. An unattended tab stops being trusted quickly. |
| **Re-auth window** | 10 min by default. Critical actions want the passphrase typed *recently*, not merely today. |
| **Lockout** | 5 wrong attempts → 5 min, doubling per further failure, capped at 1h. Never permanent: a permanent lock is a denial-of-service against your own panel at the exact moment you need it. |

Every knob is an env var — see the `Admin step-up authentication` block in
`.env.example`.

### Two gates, three answers

`lib/admin/auth.ts` is the one gate every admin page and API route runs first:

| Who | Answer | Why |
|---|---|---|
| Not signed in, or not an admin | **404** everywhere | The panel does not exist for you. Never a redirect, never a message — nothing that confirms the URL is real. |
| Admin, panel not unlocked | **403 `elevation_required`** (API) / redirect to `/admin/unlock` (page) | You're allowed here; prove it. |
| Admin, unlocked, stale passphrase, critical action | **403 `reauth_required`** | Type it again for this one. |

### Critical actions

These re-ask for the passphrase when it hasn't been entered in the last few
minutes (`lib/admin/critical-actions.ts`):

- granting or revoking admin access
- forcing a password reset — one account or all of them
- banning an account, deleting an account, deleting content
- refunds and plan overrides
- replacing the Instagram session cookies, changing app-wide ops settings
- changing the admin passphrase itself

The list is matched against the request **URL**, not opted into per handler. A
route added inside one of those families is covered on day one, which is the
point: an opt-in flag is a rule that silently stops applying the first time
someone forgets it, and the routes people add in a hurry are the destructive
ones.

The browser side is automatic too. `requestJson` (`lib/utils/api.ts`) hands the
403 to the re-auth dialog mounted by `AdminShell`, and replays the original
request once the passphrase is accepted — so every admin screen inherits the
behaviour without its own code, and you keep your page and your form state.

---

## First-time setup

Enrollment happens **out of band**, from a machine that has the Supabase
service-role key. That indirection is the whole design: if a signed-in browser
could choose the first passphrase, then a stolen session would choose it, and
the second factor would be the first factor wearing a hat.

Migration `20260821140000_admin_step_up_auth.sql` has to be applied first (it
creates `admin_credentials` and `admin_sessions`) — `npm run check:schema`
confirms it. Until it is, `/admin` sends every admin to `/admin/setup`.

```bash
# 1. On your laptop, where .env.local has SUPABASE_SERVICE_ROLE_KEY:
npm run admin:passphrase -- invite --email you@example.com

#    → prints a one-time code, e.g. K7M2Q-8XRTB-9WFHD-4NPZC, valid 30 minutes

# 2. In the browser, signed in as that account, open /admin/setup
#    Paste the code, choose the passphrase. You're in.
```

`set` writes a passphrase directly instead, prompted twice and never echoed —
useful when you can't reach the browser flow at all:

```bash
npm run admin:passphrase -- set --email you@example.com
```

The CLI refuses accounts that aren't already `is_admin`: a passphrase on a
non-admin account is dead weight that looks like access.

### Passphrase rules

At least 14 characters, and either a mix of three character classes or 24+
characters — four ordinary words are a better passphrase than `Adm1n!23` and
are what you can actually retype under pressure. It may not contain your email,
the product name, or obvious words like "admin"/"password", and (checked in the
browser, where both are visible) may not be your account password.

---

## Day-to-day

- **Unlocking** — `/admin/unlock`, once per device per 8h, sooner if you go idle.
- **Locking** — the **Lock** button in the admin top bar ends the elevation
  immediately. Use it when the laptop leaves your hands. Signing out is not a
  substitute: elevation is its own credential with its own lifetime.
- **`/admin/security`** — change the passphrase, and see every device currently
  holding the panel open (browser, OS, IP, when it was unlocked, when it
  re-locks). End one, or end all of them including your own.
- Changing the passphrase signs every **other** unlocked session out. That is
  the point when the reason for changing it is "I think someone else has been in
  here".

---

## When something goes wrong

**"Locked after too many wrong attempts."** Wait it out (5 min the first time),
or clear it from a machine with the key:

```bash
npm run admin:passphrase -- unlock --email you@example.com
```

**Forgot the passphrase.** There is no reset email and no recovery answer —
by design. Mint a fresh enrollment code and set a new one:

```bash
npm run admin:passphrase -- invite --email you@example.com
```

**Someone else may have it.** In this order:

```bash
npm run admin:passphrase -- revoke --email you@example.com   # every device, now
npm run admin:passphrase -- invite --email you@example.com   # then re-enroll
```

Then change the account password too — whoever had the passphrase reached it
through a session that is still valid.

**What happened, and when?** Two places:

- `/admin/audit` — `admin.unlock`, `admin.reauth`, `admin.unlock_failed`,
  `admin.lock`, `admin.sessions_revoked`, `admin.passphrase_enrolled`,
  `admin.passphrase_rotated`, each with IP and user agent.
- `/admin/notifications` — the alerts that fire on their own:
  `admin.unlocked` (digested), `admin.unlock_failed`, `admin.locked_out`
  (critical), `admin.passphrase_changed` (critical).

A wrong-passphrase alert you didn't cause means someone is holding a valid
admin **login** and guessing the second factor. Treat the login as compromised
and rotate everything.

**Nobody can get in at all** (lost key, lost device, lost passphrase). The
service-role key is the root of trust; recovery runs through the Supabase
project. Clearing `admin_credentials` for that user and re-running `invite` is
the intended path, and having no lower-friction path is deliberate.

---

## Where it lives

```
supabase/migrations/20260821140000_admin_step_up_auth.sql   admin_credentials, admin_sessions
lib/admin/passphrase.ts            scrypt hash + verify
lib/admin/passphrase-policy.ts     strength rules (shared with the browser)
lib/admin/credentials.ts           lockout, enrollment tickets
lib/admin/elevation.ts             mint / verify / revoke elevated sessions
lib/admin/critical-actions.ts      which URLs demand a fresh passphrase
lib/admin/auth.ts                  the gate: requireAdmin / requireAdminPage
app/admin/(gate)/                  /admin/unlock, /admin/setup — no elevation required
app/admin/(panel)/                 everything else — elevation enforced by its layout
app/api/admin/security/            unlock, lock, session, passphrase, sessions
scripts/admin-passphrase.mjs       the out-of-band half
```

Both tables are service-role only (RLS on, no policies, browser grants revoked),
the same lockdown as `admin_audit_log` and `app_settings`: the anon key cannot
read a hash, a lockout state or a ticket — not even for its own row.
