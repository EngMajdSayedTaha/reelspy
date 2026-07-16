# ReelSpy

ReelSpy is a Next.js App Router application for tracking inspiration reels, scoring virality, and generating original scripts. Production: **https://reelspy.dev**.

📚 **Documentation lives in [`docs/`](docs/README.md)** — start there for the business-logic rulebook ([`docs/BUSINESS-LOGIC.md`](docs/BUSINESS-LOGIC.md)), the full technical reference, and all setup runbooks.

## Setup (Supabase + Google + Instagram)

1. Copy `.env.example` to `.env.local` and fill all values.
2. Run SQL from `supabase/schema.sql` in Supabase SQL Editor.
	- For an existing database, apply the additive migrations in `supabase/migrations/` instead (timestamped `YYYYMMDDHHMMSS_name.sql` — see `supabase/migrations/README.md` for the convention and the GitHub↔Supabase auto-deploy).
	- **Security:** apply the `lock_down_ig_tokens` migration — it makes the stored Instagram token unreadable from browser clients (column-level grants) and restricts the rate-limiter RPCs to the server. The app already routes all token access through the service-role client, so applying it changes no behavior.
3. Configure Google provider in Supabase Auth (email/password sign-up with email confirmation is also supported out of the box).
4. Configure Instagram app credentials (`META_APP_ID` or `META_IG_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI`).
	- If Meta Business Login provides a distinct Instagram App ID, use `META_IG_APP_ID`.
5. Follow detailed steps in `docs/google-supabase-setup.md`.

### Reel transcripts (optional)

The reel transcript feature stores and displays the spoken transcript of a tracked reel.
The pipeline (`app/api/reels/[reel_id]/transcript`):

1. **yt-dlp** runs `--dump-single-json --skip-download` to read the reel's metadata and a
   direct (short-lived) media URL — without downloading the video binary. The self-contained
   `yt-dlp_linux` binary is fetched into `bin/` at install time by `scripts/fetch-ytdlp.mjs`
   and bundled into the function via `outputFileTracingIncludes` in `next.config.ts`.
2. **Whisper** transcribes the audio at that URL — `GROQ_API_KEY` (Groq `whisper-large-v3`,
   free tier, primary) or `HF_API_TOKEN` (Hugging Face, fallback).
3. The transcript is stored on `tracked_reels`; only the transcript text is persisted
   (the media file itself is not stored).

Env keys (all optional — without them the UI shows a clean "transcript unavailable" state
and never errors):

- `GROQ_API_KEY` — required for transcripts to actually work (free tier available).
- `HF_API_TOKEN` — optional Whisper fallback.
- Instagram cookies — live in Supabase (`app_settings`) and are rotated at runtime with
  `node scripts/update-ig-cookies.mjs <cookies.txt>` (no redeploy). The session self-refreshes
  and a daily health check alerts on failure — see `docs/ig-cookies-runbook.md`.
  `YTDLP_COOKIES_B64` remains only as a bootstrap fallback.
- `IG_HEALTHCHECK_REEL_URL` / `ADMIN_ALERT_EMAIL` — cookie health check + alert recipient.
- `YTDLP_BIN` — optional path override for the yt-dlp binary.

Set `GROQ_API_KEY` in `.env.local` locally and in the Vercel project's Production
environment variables.

## Development

```bash
npm install
npm run dev
```

Open http://localhost:3000/login.

## Build

```bash
npm run build
```

## Auth Setup Check

```bash
npm run check:auth-setup
```

This verifies local env keys required for Supabase + Google auth flow and confirms core database tables exist.

## Dashboard Workflow

1. Sign up and follow the onboarding wizard (`/dashboard/onboarding`): connect Instagram, set your brand voice + niche, add inspiration accounts.
2. Run sync to import recent reels.
3. Open `/dashboard/feed` (default sort: out-performance vs each account's own baseline) and select a reel to generate a script.
4. On the generate page, optionally generate the reel transcript to study its hook and pacing.
5. Review saved drafts in `/dashboard/scripts`; explore niche-wide winners in `/dashboard/trends`.
