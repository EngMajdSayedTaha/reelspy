# ReelSpy

ReelSpy is a Next.js App Router application for tracking inspiration reels, scoring virality, and generating original scripts.

## Setup (Supabase + Google + Instagram)

1. Copy `.env.example` to `.env.local` and fill all values.
2. Run SQL from `supabase/schema.sql` in Supabase SQL Editor.
	- For an existing database, apply the additive migrations in `supabase/migrations/` instead (e.g. `20260605_reel_transcripts.sql`).
3. Configure Google provider in Supabase Auth.
4. Configure Instagram app credentials (`META_APP_ID` or `META_IG_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI`).
	- If Meta Business Login provides a distinct Instagram App ID, use `META_IG_APP_ID`.
5. Follow detailed steps in `docs/google-supabase-setup.md`.

### Reel transcripts (optional)

The reel transcript feature stores and displays the spoken transcript of a tracked reel.
All transcription keys are optional — if none are set, the UI shows a clean "transcript
unavailable" state and never errors. Providers are tried in order; the first one that is
configured **and** succeeds wins:

1. `WAYINVIDEO_API_KEY` — [WayinVideo](https://wayin.ai/api/) transcript API (primary).
   Submits the reel permalink and polls for the result.
2. `GETTRANSCRIBE_API_KEY` — [GetTranscribe](https://www.gettranscribe.ai/) transcript API.
3. `REEL_TRANSCRIPT_API_URL` (+ optional `REEL_TRANSCRIPT_API_KEY` / `REEL_TRANSCRIPT_API_HOST`)
   — a generic configurable endpoint for any other provider (e.g. Subclip or a
   RapidAPI-hosted API).
4. `GROQ_API_KEY` / `HF_API_TOKEN` — Whisper (`whisper-large-v3`) on the downloaded audio.
   Only used when a reel has a downloadable video URL, which Instagram
   Business-Discovery reels generally do not expose — so the permalink-based
   providers above are the primary working path.

Set at least `WAYINVIDEO_API_KEY` (in `.env.local` locally, and in the Vercel project's
Production environment variables) for transcripts to work in production.

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

1. Connect Instagram in `/dashboard/settings/instagram`.
2. Run sync to import recent reels.
3. Open `/dashboard/feed` and select a reel to generate script.
4. On the generate page, optionally generate the reel transcript to study its hook and pacing.
5. Review saved drafts in `/dashboard/scripts`.
