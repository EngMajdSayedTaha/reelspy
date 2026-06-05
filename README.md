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
unavailable" state and never errors. Providers are tried in order:

1. `GROQ_API_KEY` — Groq `whisper-large-v3` (free tier). Only used when a reel has a
   downloadable video URL.
2. `HF_API_TOKEN` — Hugging Face Inference `whisper-large-v3` (free tier). Same constraint.
3. `REEL_TRANSCRIPT_API_URL` (+ optional `REEL_TRANSCRIPT_API_KEY` / `REEL_TRANSCRIPT_API_HOST`)
   — a permalink-based transcript API. This is the primary working path, because
   Instagram Business-Discovery reels do not expose a downloadable video for the
   audio-based providers above.

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
