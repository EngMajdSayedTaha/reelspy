# Publishing Setup (Instagram, Facebook, TikTok, YouTube, Threads)

The **Publishing** module lets you upload once — a video, a single photo, or a
multi-slide carousel — and cross-post it to your own Instagram, Facebook Page,
TikTok, YouTube channel, and Threads profile, now or scheduled. Everything runs
on each platform's **official, free** API. This guide is written for the common
case: **you posting your own content to your own accounts.**

## What needs review (and what doesn't)

| Platform | Post to your own account? | Public posts? | What's required |
|---|---|---|---|
| **Instagram** | ✅ works now | ✅ **public, no review** | App in Development/Standard mode + you are an app role. Same as Auto-Reply. |
| **Facebook Page** | ✅ works now | ✅ **public, no review** | Same Meta app + a linked Page. |
| **Threads** | ✅ works now | ✅ **public, no review** | Its **own** Threads App ID/secret + you accept a Threads Tester invite. |
| **TikTok** | ✅ works now | ⚠️ **private until audit** | Posts are forced `SELF_ONLY` until the Content Posting API audit passes. |
| **YouTube** | ✅ works now | ⚠️ **private until audit** | Uploads forced `private`; test-mode tokens expire weekly. Needs OAuth verification + API audit for public + stable tokens. |

> **Bottom line:** Instagram, Facebook and Threads give you fully public personal
> posting with **zero submissions**. TikTok and YouTube will post to your own
> account immediately, but the posts stay **private to you** until you complete
> each platform's audit (steps below).

## What each platform accepts

These are the platforms' own published limits, and they are enforced in the
composer *before* you can post — `lib/publishing/capabilities.ts` is the single
table every layer reads.

| | Video | Photo | Carousel | Caption | Per-day cap |
|---|---|---|---|---|---|
| **Instagram** | ✅ Reels, 3s–15min, ≤300 MB | ✅ JPEG ≤8 MB, 4:5–1.91:1 | ✅ **2–10**, photos + videos | 2200 chars, 30 hashtags | 50 posts / 24h |
| **Facebook Page** | ✅ | ✅ JPEG/PNG ≤10 MB | ✅ **2–10**, photos only | 63,206 chars | 30 reels / 24h |
| **TikTok** | ✅ | ✅ JPEG/WebP ≤20 MB | ✅ **2–35**, photos only | 2200 chars | — |
| **YouTube** | ✅ only | ✗ | ✗ | title 100 / desc 5000 | ~6 uploads (quota) |
| **Threads** | ✅ | ✅ JPEG/PNG | ✅ **2–20**, photos + videos | 500 chars | 250 posts / 24h |

A carousel counts as **one** post against every one of those daily caps. Photos
and videos can't be mixed in a TikTok or Facebook carousel — the composer says
so and blocks it rather than letting the platform reject it later.

The adapters enforce this automatically: TikTok/YouTube post privately unless you
set `TIKTOK_ALLOW_PUBLIC=true` / `YOUTUBE_ALLOW_PUBLIC=true` — which you should
only do **after** the corresponding audit is approved.

---

## 1. Database migration

Apply the publishing migration to your Supabase project:

```bash
supabase db push          # or run supabase/migrations/20260621_publishing.sql
```

It creates `social_connections`, `publish_posts`, `publish_media` (one row per
carousel slide) and `publish_jobs`. (The
migration also defines a Supabase `publish-media` Storage bucket, but uploaded
**video bytes now live in Cloudflare R2** — see the next step. The bucket is no
longer used by the upload flow and can be ignored.)

Set the cron secret so the scheduler can run (already used by the other crons):

```
CRON_SECRET=<long random string>
```

**Every** publish — scheduled *and* "Post now" — runs in the durable job-queue
worker `/api/cron/run-jobs` (roadmap V4). On **Hobby** it runs every 5 minutes
from `.github/workflows/run-jobs.yml`; on **Vercel Pro** prefer a `*/2` Vercel
cron (see [`cron-cadence.md`](./cron-cadence.md)).

"Post now" doesn't wait for that schedule: the server action enqueues the job and
then pokes `/api/cron/run-jobs` from `after()`, so publishing starts within a
second in its own 300-second invocation while the composer returns immediately.
That poke is authenticated with `CRON_SECRET`, so **if `CRON_SECRET` is unset in
production, "Post now" silently falls back to the 5-minute cron.** The publish
still happens — it's just late.

---

## 1b. Video storage — Cloudflare R2

Uploaded videos are stored in a private **Cloudflare R2** bucket. The browser
uploads each file **straight to R2** with a one-time presigned URL, so the bytes
never pass through the serverless function — and R2 has no per-file size cap,
which is what fixes the **413 "payload too large"** you'd hit on real-size reels
with Supabase Storage's 50 MB limit.

1. In the Cloudflare dashboard → **R2** → **Create bucket** (e.g.
   `publish-media`). Keep it **private** (no public access needed — we use
   presigned URLs).
2. **R2 → Manage R2 API Tokens → Create API token** with **Object Read & Write**
   permission for that bucket. Copy the **Access Key ID** and **Secret Access
   Key**.
3. Find your **Account ID** (R2 overview page, or the endpoint subdomain
   `https://<account-id>.r2.cloudflarestorage.com`).
4. Add a **CORS policy** to the bucket (R2 → your bucket → **Settings → CORS
   Policy**) so the browser's presigned PUT is allowed from your app origin:

   ```json
   [
     {
       "AllowedOrigins": ["https://<your-domain>", "http://localhost:3000"],
       "AllowedMethods": ["PUT", "GET"],
       "AllowedHeaders": ["content-type"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

5. Set these env vars (in Vercel → Project → Settings → Environment Variables,
   and your local `.env`):

   ```
   R2_ACCOUNT_ID=<cloudflare account id>
   R2_ACCESS_KEY_ID=<r2 token access key id>
   R2_SECRET_ACCESS_KEY=<r2 token secret access key>
   R2_BUCKET=publish-media
   ```

That's it for Instagram and YouTube — no public bucket, no custom domain. The
platform adapters fetch each video from R2 via a short-lived presigned GET URL
at publish time. **TikTok needs one more step** — see §3 below: its
`PULL_FROM_URL` mode requires the video URL's domain to be one you can verify,
which the raw `<account>.r2.cloudflarestorage.com` S3 API host never can be
(you don't control DNS for it). Set `R2_PUBLIC_BASE_URL` to a Custom Domain
bound to the bucket to unblock this — see `lib/storage/r2.ts`.

---

## 2. Instagram + Facebook — no App Review

This reuses the **same Meta app** as the Auto-Reply module — if Instagram is
already connected in ReelSpy, you're nearly done. See
[`auto-reply-setup.md`](./auto-reply-setup.md) for the shared Meta app steps.

1. Your Instagram must be a **Business or Creator** account, linked to a
   **Facebook Page**.
2. In the [Meta App Dashboard](https://developers.facebook.com/apps) → **App
   roles → Roles**, make sure your account is an **Admin/Developer/Tester**.
   People with a role can use advanced permissions while the app is in
   **Development mode** — no App Review needed.
3. Confirm these env vars are set (same as Instagram connect today):
   ```
   META_APP_ID=
   META_APP_SECRET=
   META_REDIRECT_URI=https://<your-domain>/api/ig/callback
   ```
   The connect flow already requests the publishing scopes
   `instagram_content_publish` and `pages_manage_posts`.
4. In ReelSpy go to **Publishing → Connections** and click **Connect** on the
   Instagram (and Facebook) card — both come from the one Meta OAuth flow.

You can now publish **public** Reels and Page videos to your own account.

**Limits:** Instagram allows **50 API-published posts per 24h**. The video is
handed to Meta as a short-lived signed URL, so uploads must finish processing
(the adapter polls the container until `FINISHED`).

---

## 3. TikTok

### Connect (posts privately right away)

1. Create an app at [developers.tiktok.com](https://developers.tiktok.com) and
   add the **Content Posting API** product.
2. Request the scopes `user.info.basic`, `video.publish`, `video.upload`.
3. Add your **Redirect URI**: `https://<your-domain>/api/social/tiktok/callback`.
4. Because the adapter uses `PULL_FROM_URL`, verify a domain under the app's
   **URL properties** (URL Prefix verification). This domain must be the one
   `presignGetUrl()` hands TikTok — bind a Cloudflare **Custom Domain** to the
   R2 bucket (R2 → bucket → Settings → Custom Domains) and set
   `R2_PUBLIC_BASE_URL` to it (step 1 above); the raw R2 S3 endpoint can't be
   verified since you don't control its DNS. *(Alternative: switch the adapter
   to `FILE_UPLOAD` if you'd rather not stand up a custom domain at all.)*
5. Set env vars:
   ```
   TIKTOK_CLIENT_KEY=
   TIKTOK_CLIENT_SECRET=
   TIKTOK_REDIRECT_URI=https://<your-domain>/api/social/tiktok/callback
   R2_PUBLIC_BASE_URL=https://<your custom domain bound to the R2 bucket>
   ```
6. **Publishing → Connections → TikTok → Connect.** Posts now work, but TikTok
   forces them to **`SELF_ONLY`** (visible only to you).

### Audit (to allow public posts)

1. In the TikTok developer portal, open your app → request the **`video.publish`**
   scope for production / submit for **audit**.
2. Provide the requested demo (a short screen recording of the post flow) and
   app details.
3. Once approved, set `TIKTOK_ALLOW_PUBLIC=true` and redeploy. New posts marked
   "Public" in the composer will go out as `PUBLIC_TO_EVERYONE`.

---

## 4. YouTube

### Connect (uploads privately right away)

1. In [Google Cloud Console](https://console.cloud.google.com) create/select a
   project and **enable the YouTube Data API v3**.
2. **APIs & Services → Credentials → Create OAuth client ID → Web application.**
   Add the redirect URI: `https://<your-domain>/api/social/youtube/callback`.
3. **OAuth consent screen:** User type **External**, add the scope
   `.../auth/youtube.upload`, and add your Google account under **Test users**.
   The app itself requests `youtube.upload` + `youtube.readonly` +
   `youtube.force-ssl` by default (the last two power comment auto-reply, see
   `docs/auto-reply-setup.md`) — add all three scopes here too, or the consent
   screen will reject a scope the connect flow actually asks for.
4. Set env vars:
   ```
   YOUTUBE_CLIENT_ID=
   YOUTUBE_CLIENT_SECRET=
   YOUTUBE_REDIRECT_URI=https://<your-domain>/api/social/youtube/callback
   ```
5. **Publishing → Connections → YouTube → Connect.** Uploads now work, but every
   upload is forced to **`private`**.

> ⚠️ In **Testing** mode, Google refresh tokens **expire after 7 days**, so
> you'll have to reconnect weekly until you complete verification (below).

### Verification + audit (to allow public uploads)

1. **OAuth verification:** narrower scope lists verify faster and with less
   scrutiny (Y2, `Plan_Reelspy/09-platform-access.md`). Set
   `YOUTUBE_SCOPES="https://www.googleapis.com/auth/youtube.upload"` before
   recording the demo video for this submission — it drops `youtube.readonly`
   and `youtube.force-ssl` from what's requested without touching any code.
   Leave `YOUTUBE_SCOPES` unset afterward (or once auto-reply needs the full
   set again) to fall back to the default three-scope list. In the OAuth
   consent screen, **Publish app** and submit for verification of the
   sensitive `youtube.upload` scope. This removes the "unverified app" warning
   **and** the weekly token expiry.
2. **YouTube API compliance audit:** fill out the
   [YouTube API Services audit form](https://support.google.com/youtube/contact/yt_api_form).
   This lifts the private-only restriction and can raise your quota.
3. Once both are approved, set `YOUTUBE_ALLOW_PUBLIC=true` and redeploy.

**Limits:** the default quota is **10,000 units/day**; an upload costs ~1,600
units, so about **6 uploads/day** until you request more in the audit.

---

## 5. Threads

Threads is free, needs **no App Review** to post to your own profile, and
supports text, photos, videos and carousels. The one thing to get right is that
it does **not** use `META_APP_ID` / `META_APP_SECRET`.

### Why it needs its own credentials

Threads is a separate *use case* on the Meta developer platform. When you add it
to an app, the dashboard shows **two** sets of credentials — the Meta app's, and
a **Threads App ID + Threads App Secret**. Only the Threads pair works against
`graph.threads.net`, and the consent window is hosted on `threads.net`, not
`facebook.com`. Using the Meta app id here fails with an opaque OAuth error.

### Setup

1. In the [Meta App Dashboard](https://developers.facebook.com/apps), open your
   app (or create one) and add the **Threads** use case.
2. **App settings → Basic** → copy the **Threads App ID** and **Threads App
   secret** (not the ones at the top of the page).
3. Under the Threads use case settings, add the **Redirect Callback URL**:
   `https://<your-domain>/api/social/threads/callback`.
4. **App roles → Roles → Add People → Threads Tester**, invite your own Threads
   account, then accept the invite in the Threads app under **Account Settings →
   Website permissions → Invites**. Without this the consent screen refuses you.
5. Set env vars:
   ```
   THREADS_APP_ID=
   THREADS_APP_SECRET=
   THREADS_REDIRECT_URI=https://<your-domain>/api/social/threads/callback
   ```
6. **Connections → Threads → Connect.** Posts are public immediately.

**Tokens:** the connect flow exchanges the 1-hour short-lived token for a
**60-day** long-lived one straight away. `/api/cron/refresh-tokens` renews it
nightly once it's inside the 7-day window. A long-lived token that goes 60 days
without a refresh **cannot be revived** — you have to reconnect — so make sure
that cron is actually running.

**Limits:** 250 API-published posts per 24h; carousels are 2–20 items and count
as one post; text caps at 500 characters.

---

## 6. Going-live checklist

- [ ] Migration applied (`social_connections`, `publish_posts`, `publish_media`, `publish_jobs`).
- [ ] Cloudflare R2 bucket created (private) + CORS rule + `R2_*` env vars set.
- [ ] `R2_PUBLIC_BASE_URL` set to a Custom Domain (required for TikTok).
- [ ] `CRON_SECRET` set; `/api/cron/run-jobs` scheduled (GH Actions on Hobby, or a Vercel cron on Pro).
      Without it, "Post now" degrades to the 5-minute cron.
- [ ] Instagram + Facebook connected (public posting works, no review).
- [ ] Threads connected via its **own** app id/secret + Threads Tester invite accepted.
- [ ] TikTok connected (private now) → audit passed → `TIKTOK_ALLOW_PUBLIC=true`.
- [ ] YouTube connected (private now) → verification + audit passed →
      `YOUTUBE_ALLOW_PUBLIC=true`.
- [ ] Sanity-check the limits: IG 50 posts/24h, FB reels 30/24h, Threads 250/24h,
      YouTube ~6 uploads/day.
