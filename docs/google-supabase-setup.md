# Google + Supabase Setup

## 1) Fill Environment Variables

1. Copy `.env.example` to `.env.local`.
2. Fill these values from Supabase Project Settings -> API:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

## 2) Apply Database Schema

1. Open Supabase SQL Editor.
2. Run the SQL in `supabase/schema.sql`.
3. Verify tables exist:
   - `profiles`
   - `inspiration_accounts`
   - `tracked_reels`
   - `generated_scripts`

## 3) Configure Google OAuth in Supabase

1. In Supabase Dashboard -> Authentication -> Providers -> Google:
   - Enable Google provider
   - Add your Google OAuth Client ID
   - Add your Google OAuth Client Secret
2. In Supabase Dashboard -> Authentication -> URL Configuration:
   - Site URL: `http://localhost:3000`
   - Redirect URLs:
     - `http://localhost:3000/auth/callback`
     - Production URL callback (when deployed)

## 4) Configure Google Cloud OAuth App

1. In Google Cloud Console, create Web OAuth credentials.
2. Add Authorized JavaScript origins:
   - `http://localhost:3000`
3. Add Authorized redirect URI shown by Supabase Google provider page.
   - It is usually in the format:
     - `https://<your-project-ref>.supabase.co/auth/v1/callback`

## 5) Verify Locally

1. Run `npm run dev`.
2. Open `/login`.
3. Click "Continue with Google".
4. After Google auth, app should return to `/auth/callback` then redirect to `/dashboard`.

## Troubleshooting

- `supabase_env_missing` on login:
  - `.env.local` is missing Supabase values.
- `oauth_exchange_failed` on callback:
  - Supabase Google provider config or redirect URLs are incorrect.
- `user_not_found` or `profile_upsert_failed`:
  - Schema was not applied, or policies/permissions are missing.
