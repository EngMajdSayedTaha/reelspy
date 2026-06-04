# ReelSpy

ReelSpy is a Next.js App Router application for tracking inspiration reels, scoring virality, and generating original scripts.

## Setup (Supabase + Google + Instagram)

1. Copy `.env.example` to `.env.local` and fill all values.
2. Run SQL from `supabase/schema.sql` in Supabase SQL Editor.
3. Configure Google provider in Supabase Auth.
4. Configure Instagram app credentials (`META_APP_ID` or `META_IG_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI`).
	- If Meta Business Login provides a distinct Instagram App ID, use `META_IG_APP_ID`.
5. Follow detailed steps in `docs/google-supabase-setup.md`.

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
4. Review saved drafts in `/dashboard/scripts`.
