# Auto-Reply Setup (Comment → Public Reply + DM)

The Auto-Reply module links one of **your own reels** to keywords. When a
follower comments a matching keyword, ReelSpy:

1. **likes (hearts)** the comment — best-effort; see note below,
2. posts a **public reply** under the comment (rotating templates, e.g. "Check your DMs 📩"), and
3. sends the follower a **private reply DM** with your message + link.

It also supports **DM keyword automations**: when someone sends your account a
direct message matching your keywords (or any message, with a once-per-24h
per-person cooldown), they get an automatic reply + link. Story replies are
deliberately ignored. Requires the `messages` webhook field (setup step 6).

> **Note on likes:** liking a comment/media is **not exposed on the Facebook
> Login Graph API path** this app uses — `POST /{id}/likes` returns
> `GraphMethodException` (code 100 / subcode 33, "does not support this
> operation") for comments *and* media, with both the user and the page token.
> The like step is therefore best-effort and, when Meta rejects it as
> unsupported, the Activity log records it as `skipped` (not `failed`) while the
> reply and DM proceed normally. If Meta ever enables the edge for this
> connection it will start reporting `sent` automatically. To turn the attempt
> off entirely, set `AUTO_REPLY_LIKE_DISABLED=1` in the environment.

Everything runs on Meta's official Graph API — 100% free. Because only your
own account uses the app (you are the app admin), **Standard Access is enough:
no Meta App Review needed**.

## Meta-enforced constraints (good to know up front)

- **One DM per comment**, and only **within 7 days** of the comment. A second
  matching comment from the same person gets a DM again (it's a new comment).
- Your Instagram account must be **Business or Creator** and linked to a
  **Facebook Page** (already true if ReelSpy is connected).
- Replies/DMs are sent to commenters of any account; webhook delivery and
  private replies are only reliable once the app is in **Live mode**.

## One-time setup

### 1. Apply the database migration

Run `supabase/migrations/20260613_auto_reply.sql` against your Supabase project
(Supabase Dashboard → SQL Editor, or `supabase db push`).

### 2. Add the env var

Generate a random string (e.g. `openssl rand -hex 24`) and set it in Vercel
and `.env.local`:

```
META_WEBHOOK_VERIFY_TOKEN=<random string>
```

Deploy so the webhook endpoint (`/api/ig/webhooks`) is live before step 3.

### 3. Configure the webhook in the Meta App Dashboard

1. App Dashboard → **Products** → add **Webhooks** (if not present).
2. Select the **Instagram** object.
3. Callback URL: `https://<your-domain>/api/ig/webhooks`
   Verify Token: the `META_WEBHOOK_VERIFY_TOKEN` value.
4. Click **Verify and Save** — Meta calls the endpoint's GET handler.
5. **Subscribe to the `comments` field** on the Instagram object.
6. For **DM keyword automations**, also subscribe to the **`messages`** field
   on the Instagram object, then reconnect Instagram in ReelSpy once (the
   page-level subscription now includes `messages`; reconnecting refreshes it).

### 4. Permissions

The connect flow now requests four extra scopes:
`instagram_manage_comments`, `instagram_manage_messages`,
`pages_manage_metadata`, `pages_messaging`.

- If you set `META_IG_SCOPES` in your env, add the four scopes there too.
- If you use **Facebook Login for Business** (`META_FB_CONFIG_ID`), add the
  four permissions to that login configuration in the App Dashboard instead —
  the config defines the permissions, not the scope string.

### 5. Switch the app to Live mode

App Dashboard → toggle **Live**. Standard Access is sufficient since the
connected account belongs to the app admin. (In Development mode, Meta does not
reliably deliver comment webhooks for — or allow DMs to — people without a role
on the app.)

### 6. Reconnect Instagram in ReelSpy

Settings → Instagram → **Reconnect**. This grants the new permissions, stores
the Facebook **Page token** (private replies are sent with it), and subscribes
your Page to the app (`/{page-id}/subscribed_apps`) — without that call Meta
delivers no webhooks for your account.

### 7. Create an automation

Dashboard → **Auto-Reply** → pick a reel, enter keywords (e.g. `link, guide`),
the public reply templates, your DM message, and the link. Done.

## Verifying it works

1. Webhook handshake (after deploy):
   `curl "https://<domain>/api/ig/webhooks?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=12345"`
   should return `12345`; a wrong token returns 403.
2. From a **second** Instagram account, comment a keyword on the automated
   reel: the public reply appears, the DM arrives, and the row shows up under
   Auto-Reply → Activity as `sent / sent`.
3. A comment **without** a keyword does nothing (and is not logged).

## Troubleshooting

- **Nothing fires:** check the Activity log; if empty, confirm the app is
  Live, the `comments` field is subscribed, and you reconnected after this
  feature shipped (the Auto-Reply page shows a banner if not).
- **DM keyword automations never fire (DM Activity stays empty):** the comment
  flow can work while DM automations don't, because they ride a *different*
  webhook field. Confirm **both**: (a) the **`messages`** field is subscribed on
  the **Instagram** object in the App Dashboard (subscribing `comments` only is
  the usual cause), and (b) on the connected IG account, **Settings → Messages
  and story replies → Connected tools → Allow access to messages** is ON —
  without it Meta delivers no message webhooks. Then reconnect Instagram once so
  the page re-subscribes. (The page-level `subscribed_apps` already lists
  `messages` after a reconnect; the gap is almost always the Instagram-object
  field subscription or the IG toggle.)
  - **Shortcut:** the Auto-Reply page now has a **"DM delivery check"** panel.
    Its **Re-subscribe & check** button re-runs the page subscription (no full
    reconnect needed) and reads the fields back, so it tells you immediately
    whether Meta reports the `messages` field as active. Use it after toggling
    the two manual steps above.
- **DM fails with "already sent":** expected — Meta allows one private reply
  per comment.
- **DM fails with a permissions error:** the reconnect didn't grant
  `instagram_manage_messages` / `pages_messaging` (see step 4), or the app is
  still in Development mode.
- **Webhooks unreliable:** a polling fallback exists at
  `/api/cron/poll-comments` (same dedupe, safe to run alongside webhooks).
  Schedule it by adding to `vercel.json`:
  `{ "path": "/api/cron/poll-comments", "schedule": "*/10 * * * *" }`
  (note: Vercel Hobby plan only allows daily cron schedules).

---

# YouTube Comment Auto-Reply

A separate automation that posts a **public reply** to comments on **your own
YouTube videos** when they match your keywords. Comments-only — YouTube has no
DMs. Unlike Instagram, the YouTube Data API has **no push webhooks for
comments**, so delivery is **poll-based**.

## How it differs from Instagram

- **Polling, not webhooks.** The cron `/api/cron/poll-youtube-comments` lists
  recent comments and posts replies. Vercel Hobby caps crons at once a day, so
  the `*/15 * * * *` (every 15 min) schedule runs from the GitHub Actions
  workflow `.github/workflows/poll-youtube-comments.yml`, which hits the
  endpoint with `CRON_SECRET`. Idempotency is the same as IG: the unique
  `youtube_automation_events.comment_id` means a comment is only replied once.
- **New comments only.** A new automation only answers comments posted *after*
  it was created — the existing backlog is never touched (avoids quota burn and
  spamming old threads).
- **Quota.** Default YouTube quota is 10,000 units/day. `commentThreads.list`
  costs 1 unit per automation per run; `comments.insert` costs ~50 units per
  reply. The 15-min cadence keeps a normal account well under budget.

## One-time setup

### 1. Apply the migration

Run `supabase/migrations/20260625_youtube_auto_reply.sql` (creates
`youtube_automations` + `youtube_automation_events`).

### 2. Connect / reconnect YouTube with the comment scope

Posting a reply needs the **`https://www.googleapis.com/auth/youtube.force-ssl`**
scope — the upload/readonly scopes alone **cannot write comments**. The connect
flow now requests it, so:

- **New connections:** just connect YouTube in Publishing → Connections.
- **Existing connections:** **reconnect** to grant `youtube.force-ssl`. The
  Auto-Reply page shows a banner prompting this until the scope is present.

Requires `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REDIRECT_URI`
(already set for publishing) and `CRON_SECRET` for the cron auth.

### 3. Enable the polling scheduler (GitHub Actions)

The poll runs from `.github/workflows/poll-youtube-comments.yml` every ~15 min.
In the repo, go to **Settings → Secrets and variables → Actions** and add:

- Secret **`CRON_SECRET`** — the same value as the Vercel `CRON_SECRET` env var.
- Variable **`APP_BASE_URL`** — `https://<your-production-domain>` (no trailing slash).

The workflow runs on the default branch once merged. You can trigger it manually
from the Actions tab (**Run workflow**) to verify before waiting for the schedule.

### 4. Create an automation

Dashboard → **Auto-Reply** → **YouTube Auto-Reply** → paste a video link (or the
11-char id), choose keywords, and write the public reply templates.

## Verifying it works

1. Reconnect YouTube and confirm `social_connections.scopes` includes
   `youtube.force-ssl`.
2. Create an automation on a test video; from a **second** Google account post a
   comment containing a keyword.
3. Trigger the cron with the secret:
   `curl -H "Authorization: Bearer <CRON_SECRET>" "https://<domain>/api/cron/poll-youtube-comments"`
   → response shows `actioned >= 1`, a row appears under **YouTube Activity** as
   `sent`, and the reply is visible under the comment on YouTube.
4. Re-run the cron → the same comment is **not** replied to again (idempotency).

## Troubleshooting

- **Reply fails with a permissions error:** the connection lacks
  `youtube.force-ssl` — reconnect YouTube. Auth failures (401/403) flag the
  connection `invalid`, and the page prompts a reconnect.
- **Nothing happens:** confirm the cron is scheduled/triggered and the comment
  was posted *after* the automation was created (older comments are skipped by
  design).
