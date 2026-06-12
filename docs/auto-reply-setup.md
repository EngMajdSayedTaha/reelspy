# Auto-Reply Setup (Comment → Public Reply + DM)

The Auto-Reply module links one of **your own reels** to keywords. When a
follower comments a matching keyword, ReelSpy:

1. **likes (hearts)** the comment — best-effort; see note below,
2. posts a **public reply** under the comment (rotating templates, e.g. "Check your DMs 📩"), and
3. sends the follower a **private reply DM** with your message + link.

> **Note on likes:** Meta only added comment-liking to the official API in
> 2026 and its documentation is thin. The like step is therefore best-effort:
> if Meta rejects it, the Activity log shows the like as `failed` with Meta's
> message while the reply and DM proceed normally. To turn likes off without
> a code change, set `AUTO_REPLY_LIKE_DISABLED=1` in the environment.

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
