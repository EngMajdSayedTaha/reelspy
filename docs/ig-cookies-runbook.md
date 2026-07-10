# Instagram Cookies Runbook (yt-dlp transcript pipeline)

The reel transcript pipeline resolves Instagram media URLs with yt-dlp. Instagram
often demands a logged-in session for that, supplied as a Netscape `cookies.txt`.
This runbook covers how the self-healing cookie system works, how to mint
long-lived cookies, and how to rotate them — **no Vercel redeploy is ever needed**.

> These cookies are for **Instagram only**. YouTube uses the official Data API
> with OAuth and needs no cookies.

## Why cookies used to die

1. **Session rotation.** Instagram rotates `sessionid`/`csrftoken` server-side on
   requests. yt-dlp writes the rotated cookies back to the file it's given, but
   a frozen env var (`YTDLP_COOKIES_B64`) threw that rotation away — the stored
   copy drifted stale until Instagram rejected it.
2. **Browser reuse.** Cookies exported from a browser you keep using get
   invalidated: browsing Instagram there rotates the session and kills the
   exported copy. Exporting from a *personal* account/browser is the #1 cause of
   cookies dying within days.

## How the system keeps itself alive

- Cookies live in Supabase (`app_settings`, key `ig_cookies`), not in an env
  var, so they're updatable at runtime. `YTDLP_COOKIES_B64` remains only as a
  bootstrap fallback and is auto-copied into the DB on the first successful
  authenticated run — you can delete it from Vercel afterwards.
- Extraction tries **without cookies first**; the session is only spent when
  Instagram demands a login, which slows session burn dramatically.
- After every successful cookie-authenticated run, the pipeline persists the
  jar yt-dlp rewrote — capturing Instagram's rotation (**self-refresh**).
- A **daily GitHub Actions health check** (`.github/workflows/ig-cookie-health.yml`
  → `/api/cron/ig-cookie-health`) runs one authenticated extraction against
  `IG_HEALTHCHECK_REEL_URL`. Success doubles as a keep-alive (the daily touch +
  write-back is what keeps the session fresh even with no user traffic).
  Failure emails `ADMIN_ALERT_EMAIL` via Resend and turns the Actions run red
  (GitHub's own failure email is the free backup channel).
- Live status (age, last success, last error — never the cookie material) is
  visible at `GET /api/reels/diag` (any authenticated user) under `cookies`.

## Minting long-lived cookies (do this once)

Use a **dedicated Instagram account**, not your personal one — a personal
account risks challenges on your real identity, and personal browsing kills the
session (see above).

1. Create/choose a dedicated Instagram account. Let it age a bit and look
   normal (profile picture, a few follows) before relying on it.
2. Open a **private/incognito window**, log in to instagram.com with that
   account, and browse a few reels so the session looks human.
3. Export cookies with a "Get cookies.txt (locally)"-style browser extension
   (Netscape format).
4. **Close the private window without logging out** — and never open that
   account in a browser again. Any later browser use rotates the session and
   invalidates your export.

## Rotating cookies (when the alert fires)

```bash
node scripts/update-ig-cookies.mjs ~/Downloads/cookies.txt --url https://<your-production-domain>
```

The script authenticates with `CRON_SECRET` (from `.env.local`), and the server:

1. Validates the file (Netscape format, non-expired `sessionid`) — bad pastes
   are rejected with specific problems, nothing is overwritten.
2. Live-tests the *candidate* cookies with a real extraction from Vercel's own
   egress IPs (needs `IG_HEALTHCHECK_REEL_URL`).
3. Stores them; all serverless instances pick them up within ~60 seconds.

Verify: `GET /api/reels/diag` → `cookies.source: "db"` with a fresh `updatedAt`.

The endpoint also accepts a logged-in admin session (`profiles.is_admin`), so a
future admin UI can reuse it as-is.

## Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `IG_HEALTHCHECK_REEL_URL` | Vercel | A stable, public reel (ideally your own) used by the daily health check and the pre-save live test. |
| `ADMIN_ALERT_EMAIL` | Vercel | Recipient for cookie-failure alerts (needs `RESEND_API_KEY`/`EMAIL_FROM`). |
| `YTDLP_COOKIES_B64` | Vercel | Legacy bootstrap fallback only — deletable once `/api/reels/diag` shows `cookies.source: "db"`. |
| `CRON_SECRET` | Vercel + GitHub secret + `.env.local` | Authenticates the health cron and the update script. |

## Health signals to watch

- `last_ok_at` advances daily → the health cron is passing.
- `updatedAt`/`rotations` move occasionally → the write-back is capturing
  Instagram's rotation (the session is being kept alive).
- Alert email / red `IG cookie health` Actions run → rotate cookies (above).
  The error `kind` in the email tells you why: `authRequired`/`botCheck` means
  the session is dead or challenged; `rateLimited` usually resolves itself.
