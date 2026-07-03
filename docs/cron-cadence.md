# Cron cadence — Hobby vs Pro

`vercel.json` currently ships the **Hobby-safe** cron set: the two daily jobs
only. Vercel's Hobby plan caps you at **2 cron jobs, each at most once per day**,
so the frequent publishing/comment crons are **temporarily disabled** until the
project is on **Vercel Pro** (founder decision #3 / roadmap L8).

## Active now (Hobby)

```json
{ "path": "/api/cron/refresh-snapshots", "schedule": "0 6 * * *" }
{ "path": "/api/cron/refresh-tokens",    "schedule": "30 3 * * *" }
```

## Re-enable after upgrading to Vercel Pro

Add these two entries back to the `crons` array in `vercel.json` and redeploy:

```json
{ "path": "/api/cron/publish-due",   "schedule": "*/5 * * * *" },
{ "path": "/api/cron/poll-comments", "schedule": "*/10 * * * *" }
```

- **`publish-due` (`*/5`)** — the scheduled-post worker. While it's off,
  scheduled posts do **not** auto-publish; "Post now" still works (it runs the
  dispatcher inline). Publishing a scheduled post is deferred until this cron is
  live on Pro.
- **`poll-comments` (`*/10`)** — the webhook fallback that re-scans for
  comment→DM automation events. The **primary** path is the Meta webhook
  (processed inline via `after()`), so automations still fire in real time
  without it; this cron is only the safety net for missed webhooks.

Everything else about these routes (auth via `CRON_SECRET`, idempotency) is
unchanged — only the `vercel.json` schedule registration is gated on Pro.
