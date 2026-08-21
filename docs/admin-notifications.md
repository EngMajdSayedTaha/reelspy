# Admin notifications (alerts)

**Admin → Notifications** is the operational inbox: everything the product
thinks the founder should know about — who joined, what was paid, what broke —
plus the settings that decide which of it reaches an actual inbox.

It replaces the one hard-coded alert email the cookie watchdog used to send.

## The model

```
something happens  →  notifyAdmins("<event>", {...})
                         ↓
                   routing decision      (lib/notifications/routing.ts)
                         ↓
                   admin_alerts row      ← ALWAYS written, whatever the decision
                         ↓
              email now │ wait for digest │ nothing
```

Two rules explain almost every behaviour:

1. **The inbox is the source of truth; email is one channel over the top of
   it.** An alert is logged even when it is dropped, throttled or held — which
   is what makes *"why didn't I get an email about this?"* answerable from the
   UI (the row carries the decision and its reason) instead of by reading code.
2. **Alerting degrades towards noise, never towards silence.** An unreadable
   settings row resolves to the catalog defaults, not to "off". Switching the
   digest off emails the batched alerts immediately rather than dropping them.
   `critical` ignores quiet hours.

## What can alert

The catalog lives in `lib/notifications/catalog.ts` — one entry per event, with
its category, severity, and the defaults for whether it alerts, whether it
batches, and how often the same thing may alert twice.

| Category | Events |
| --- | --- |
| Growth | waiting-list application, new account, account deleted |
| Revenue | new subscription, payment failed, subscription canceled, chargeback, refund |
| Reliability | job gave up, scheduled task failed, integration unhealthy, publish failed |
| Security | admin access changed, user banned, forced password reset for everyone |
| Abuse | public endpoint rate-limited |

Severity is fixed per event and drives the subject prefix (`[ReelSpy ALERT]` /
`[ReelSpy]` / `[ReelSpy FYI]`), the severity floor, and whether quiet hours
apply.

## Adding a new alert

1. Add an entry to `ALERT_EVENTS` in `lib/notifications/catalog.ts`.
2. Call it from the code path that detects the thing:

```ts
import { notifyAdmins } from "@/lib/notifications/notify";

await notifyAdmins("billing.dispute_opened", {
  title: "Chargeback opened on a $29 charge",
  summary: "Stripe needs evidence within 7 days.",
  context: { Customer: email, Amount: "$29.00" },
  link: "/admin/billing",          // relative admin path
  dedupeKey: `dispute:${dispute.id}`,
}, { admin });                      // pass the service-role client if you have one
```

That's the whole integration. The settings UI, the digest, the throttle and the
audit trail pick it up automatically.

`notifyAdmins` **never throws and never rejects** — it is called from the Stripe
webhook, the job worker and the public waiting-list endpoint, where an alerting
failure must not become a user-visible failure or a webhook retry storm. Callers
can safely `await` it.

`dedupeKey` identifies the *thing* the alert is about, so a storm of one failure
folds into a single row with a repeat count instead of forty emails. Omit it
when every occurrence is genuinely distinct (one signup is never a repeat of
another).

For the two common reliability cases there are one-line helpers in
`lib/notifications/cron.ts`: `notifyCronFailure(name, error)` and
`notifyIntegrationUnhealthy(name, { summary })`.

## Settings

Stored in the `admin_notifications` row of `app_settings`, written only through
`PUT /api/admin/notifications/settings` (which validates the shape and audits
the diff). Every change is saved on toggle — there is no Save button, because a
half-saved alerting config that someone forgot to submit is the failure this
page exists to prevent.

- **Recipients** — up to five addresses, each mailed separately so one admin
  can't read the others' addresses off a header. Empty falls back to the
  `ADMIN_ALERT_EMAIL` env var, so a deployment that never opens this page keeps
  the behaviour it had before this feature shipped.
- **Minimum severity** — anything below it is logged but never emailed.
- **Quiet hours** — evaluated in the founder's own UTC offset. Non-urgent
  alerts inside the window wait for the digest; `critical` always comes through.
- **Digest** — batched alerts in one email every 1–24h. "Send now" flushes it.
- **Per event** — on/off, instant vs digest, and the repeat window.

## Delivery

Email goes out through the same branded template as every customer email
(`lib/email/layout.ts`), so an internal alert that renders badly is the first
sign the shared template has regressed. It needs `RESEND_API_KEY` and
`EMAIL_FROM`; without them alerts are still logged and the page says so.

The digest is flushed by `/api/cron/admin-digest`, run hourly by
`.github/workflows/admin-digest.yml`. The **endpoint** decides whether the
configured interval has elapsed, so the cadence stays a product setting rather
than a cron expression that needs a deploy to change.

## Retention

Resolved alerts older than `ALERT_RETENTION_DAYS` (default 180) are deleted by
the weekly `/api/cron/prune-events` run — they quote customer emails and Stripe
amounts, so the same PDPL minimization rule as the event logs applies.
**Unresolved alerts are never pruned**, however old.

## Files

| Path | What it is |
| --- | --- |
| `lib/notifications/catalog.ts` | The event registry (pure data) |
| `lib/notifications/prefs.ts` | Preferences: shape, normalization, persistence |
| `lib/notifications/routing.ts` | The routing decision (pure, unit-tested) |
| `lib/notifications/notify.ts` | `notifyAdmins()` — the dispatcher |
| `lib/notifications/alerts.ts` | Inbox queries + the digest flush |
| `lib/notifications/email.ts` | Alert and digest email templates |
| `lib/notifications/cron.ts` | `notifyCronFailure` / `notifyIntegrationUnhealthy` |
| `app/api/admin/notifications/*` | Settings, inbox, test send, manual flush |
| `app/api/cron/admin-digest` | The hourly digest flush |
| `app/admin/notifications` | The page |
| `supabase/migrations/20260821120000_admin_alerts.sql` | The `admin_alerts` table |
