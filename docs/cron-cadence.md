# Cron cadence — Hobby vs Pro

`vercel.json` ships the **Hobby-safe** cron set: the two daily jobs only.
Vercel's Hobby plan caps you at **2 cron jobs, each at most once per day**, so
the frequent workers run from **GitHub Actions** until the project is on
**Vercel Pro** (founder decision #3 / roadmap L8).

## Active now (Hobby)

`vercel.json` (Vercel-scheduled):

```json
{ "path": "/api/cron/refresh-snapshots", "schedule": "0 6 * * *" }
{ "path": "/api/cron/refresh-tokens",    "schedule": "30 3 * * *" }
```

GitHub Actions (`.github/workflows/`), each `curl`s its endpoint with
`CRON_SECRET`:

- **`run-jobs.yml`** (`*/5`) — the durable job-queue worker (roadmap V4). Drains
  the `jobs` table: scheduled publishing, post-sync auto-transcribe, and weekly
  digest sends. This is what makes **scheduled posts auto-publish**; "Post now"
  is unaffected (it runs the dispatcher inline).
- **`weekly-digest.yml`** (Mon 08:00) — enqueues one `send_digest` job per
  opted-in user; `run-jobs` sends them.
- **`prune-events.yml`** (Sun 04:00) — event-log retention (roadmap V7). Deletes
  rows past the retention window from `app_events` / `ai_usage` /
  `automation_events` (`EVENT_RETENTION_DAYS`, default 365) and terminal jobs
  (`JOBS_RETENTION_DAYS`, default 30) for PDPL data minimization + queue-table
  hygiene. A no-op until data ages past the window.
- **`poll-youtube-comments.yml`** — YouTube auto-reply poller.
- **`ig-cookie-health.yml`** (daily 07:15) — Instagram cookie watchdog for the
  transcript pipeline. Runs one cookie-authenticated extraction against
  `IG_HEALTHCHECK_REEL_URL`; success doubles as the session keep-alive
  (persists the cookies Instagram rotated), failure emails
  `ADMIN_ALERT_EMAIL` and goes red. See `docs/ig-cookies-runbook.md`.

5 minutes is the finest granularity GitHub Actions cron supports, and scheduled
runs are best-effort (can be delayed under load).

## Re-enable frequent crons after upgrading to Vercel Pro

Add these to the `crons` array in `vercel.json` and redeploy. Once `run-jobs` is
Vercel-scheduled you can disable `.github/workflows/run-jobs.yml`.

```json
{ "path": "/api/cron/run-jobs",      "schedule": "*/2 * * * *" },
{ "path": "/api/cron/poll-comments", "schedule": "*/10 * * * *" }
```

- **`run-jobs` (`*/2`)** — the job-queue worker (above). A tighter cadence than
  the 5-min Actions floor shortens scheduled-publish latency.
- **`poll-comments` (`*/10`)** — the webhook fallback that re-scans for
  comment→DM automation events. The **primary** path is the Meta webhook
  (processed inline via `after()`), so automations still fire in real time
  without it; this cron is only the safety net for missed webhooks.

Everything else about these routes (auth via `CRON_SECRET`, idempotency) is
unchanged — only the schedule registration is gated on Pro.
