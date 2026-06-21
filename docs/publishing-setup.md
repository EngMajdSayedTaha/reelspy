# Publishing Setup (Instagram, Facebook, TikTok, YouTube)

The **Publishing** module lets you upload one video and cross-post it to your own
Instagram Reels, Facebook Page, TikTok, and YouTube channel — now or scheduled.
Everything runs on each platform's **official, free** API. This guide is written
for the common case: **you posting your own videos to your own accounts.**

## What needs review (and what doesn't)

| Platform | Post to your own account? | Public posts? | What's required |
|---|---|---|---|
| **Instagram Reels** | ✅ works now | ✅ **public, no review** | App in Development/Standard mode + you are an app role. Same as Auto-Reply. |
| **Facebook Page** | ✅ works now | ✅ **public, no review** | Same Meta app + a linked Page. |
| **TikTok** | ✅ works now | ⚠️ **private until audit** | Posts are forced `SELF_ONLY` until the Content Posting API audit passes. |
| **YouTube** | ✅ works now | ⚠️ **private until audit** | Uploads forced `private`; test-mode tokens expire weekly. Needs OAuth verification + API audit for public + stable tokens. |

> **Bottom line:** Instagram + Facebook give you fully public personal posting
> with **zero submissions**. TikTok and YouTube will post to your own account
> immediately, but the posts stay **private to you** until you complete each
> platform's audit (steps below).

The adapters enforce this automatically: TikTok/YouTube post privately unless you
set `TIKTOK_ALLOW_PUBLIC=true` / `YOUTUBE_ALLOW_PUBLIC=true` — which you should
only do **after** the corresponding audit is approved.

---

## 1. Database migration

Apply the publishing migration to your Supabase project:

```bash
supabase db push          # or run supabase/migrations/20260621_publishing.sql
```

It creates `social_connections`, `publish_posts`, `publish_jobs`, and a private
Storage bucket named **`publish-media`** (with per-user RLS). After it runs,
confirm in Supabase → Storage that the `publish-media` bucket exists and is
**not public**.

Set the cron secret so the scheduler can run (already used by the other crons):

```
CRON_SECRET=<long random string>
```

The scheduled-post worker is `/api/cron/publish-due` (registered in
`vercel.json`, runs every 15 minutes).

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
4. Because the adapter uses `PULL_FROM_URL`, verify your domain under the app's
   **URL properties** (URL Prefix verification). *(Alternative: switch the
   adapter to `FILE_UPLOAD` if you prefer not to verify a domain.)*
5. Set env vars:
   ```
   TIKTOK_CLIENT_KEY=
   TIKTOK_CLIENT_SECRET=
   TIKTOK_REDIRECT_URI=https://<your-domain>/api/social/tiktok/callback
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

1. **OAuth verification:** in the OAuth consent screen, **Publish app** and
   submit for verification of the sensitive `youtube.upload` scope. This removes
   the "unverified app" warning **and** the weekly token expiry.
2. **YouTube API compliance audit:** fill out the
   [YouTube API Services audit form](https://support.google.com/youtube/contact/yt_api_form).
   This lifts the private-only restriction and can raise your quota.
3. Once both are approved, set `YOUTUBE_ALLOW_PUBLIC=true` and redeploy.

**Limits:** the default quota is **10,000 units/day**; an upload costs ~1,600
units, so about **6 uploads/day** until you request more in the audit.

---

## 5. Going-live checklist

- [ ] Migration applied; `publish-media` bucket exists and is private.
- [ ] `CRON_SECRET` set; `/api/cron/publish-due` scheduled.
- [ ] Instagram + Facebook connected (public posting works, no review).
- [ ] TikTok connected (private now) → audit passed → `TIKTOK_ALLOW_PUBLIC=true`.
- [ ] YouTube connected (private now) → verification + audit passed →
      `YOUTUBE_ALLOW_PUBLIC=true`.
- [ ] Sanity-check the limits: IG 50 posts/24h, YouTube ~6 uploads/day.
