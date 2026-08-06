# Waiting list (closed beta) — runbook

How to close the product behind a waiting list, review who applies, and let
people in. One switch, in the admin panel, no redeploy.

**Admin page:** `/admin/waitlist`
**Flag row:** `app_settings` key `flag:waitlist`
**Migration:** `supabase/migrations/20260806120000_waitlist.sql`

---

## What "on" actually changes

| Surface | Waiting list OFF | Waiting list ON |
|---|---|---|
| Marketing CTAs (reelspy.dev) | "Start free" → `/signup` | "Join the waiting list" → join dialog |
| `app.reelspy.dev/signup` | The account form | The join form |
| `/login` | Normal | **Normal** — existing users always get in |
| A new account reaching `/dashboard` | The product | Redirected to `/waitlist` ("you're #47") |
| An existing account reaching `/dashboard` | The product | **The product** (grandfathered) |

Nothing else changes. Billing, cron, publishing and the API are untouched.

---

## The one design decision worth knowing

**The gate is on the dashboard, not on account creation.**

Sign-up runs client-side against Supabase Auth (and, for Google, entirely inside
the OAuth provider), so the app never sits in the middle of it. An app-level
"signups are closed" check would be decoration — anyone can call the Supabase
client directly. Blocking at the *product* boundary is enforceable, behaves
identically for email and Google, and gives a much better funnel: one tap to
sign up, land on "you're #47 in line", get let in automatically the moment you
approve them. No invite codes, no second credential system, no lost accounts.

The join form on `/signup` is therefore a **funnel** decision, not a security
control. Someone who works around it still lands on the pending screen.

> Want the harder gate as well? Supabase → Authentication → Sign In / Providers
> → **Disable new user signups**. Admin invites (`inviteUserByEmail`) still work
> when that's on. It is not required, and it is not controlled from this panel.

### Known boundary

The gate is on the dashboard **pages**, not on `/api/*`. A held account holds a
valid session, so someone who hand-crafts API calls could still drive the
product without a UI. That is a deliberate trade: gating ~40 route handlers
individually is a large surface to keep correct, and the routes that actually
cost money are already bounded by per-user rate limits (§2b) and by plan
entitlements — a held account resolves to the **free** tier, so it gets free-tier
caps on scripts, transcripts and accounts.

If the closed beta ever needs to be airtight (e.g. the free tier stops being
cheap to serve), the enforceable version is Supabase's "disable new user
signups" above — no account, no session, no API. Add that rather than trying to
gate every route.

---

## Access rules (`lib/waitlist/access.ts`)

Someone gets into the dashboard when **any** of these is true:

1. The waiting list is off.
2. They're an admin (`profiles.is_admin`).
3. Their account was created **before** the switch was last turned on
   (`flag:waitlist → enabledSince`). ← the grandfather rule
4. Their waiting-list entry is `approved`.

Rule 3 is the important one: **flipping the switch never locks out an existing,
possibly paying, customer.** `enabledSince` is stamped on every OFF→ON
transition and is never client-settable.

Everything fails **open**. A missing service-role key, an unapplied migration or
a DB blip resolves to "waiting list off" — because guessing "on" during an
outage locks out the entire customer base, and guessing "off" costs a marketing
gate for a few minutes.

---

## Statuses

| Status | Meaning | Grants access? | Emails? |
|---|---|---|---|
| `pending` | Waiting. The default. | no | — |
| `invited` | Shortlisted / reached out to. A triage label for working the queue. | **no** | — |
| `approved` | Access granted. | **yes** | "You're in" |
| `rejected` | Declined. Kept rather than deleted so the address can't quietly rejoin at the top of the queue. | no | — |

Transitions are idempotent: re-approving an already-approved entry changes
nothing and sends no second email, which is what makes bulk-approving a filtered
page safe to click twice.

---

## Day-to-day

**Turn it on.** `/admin/waitlist` → **Turn on**. Confirm the dialog (it spells
out the consequences). CTAs on the marketing site change within a minute (the
public flag endpoint is edge-cached for 60s); the dashboard gate is instant.

**Review.** The table defaults to *Pending*, newest first. Search matches email,
name, Instagram handle and niche. Each row shows the qualification fields the
person filled in, whether they already have an account, and where they came
from.

**Let a batch in.** Tick the rows → **Approve**. Each newly-approved entry gets
one "you're in" email. They're in the moment the status flips — no further
action needed on their side, and if they're already signed in, the *Check again*
button on their pending screen drops them into the dashboard.

**Add someone by hand.** Bottom of the page — "Add & approve" grants access to
that email address directly (useful after meeting a creator at an event).

**Export.** The CSV button exports whatever filter is showing. Formula-injection
safe, UTF-8 BOM so Excel reads Arabic names correctly.

**Turn it off.** **Turn off** → the gate comes down immediately for everyone,
approved or not. The list and all its data are kept.

---

## Modes

| Setting | Effect |
|---|---|
| **Auto-approve new entries** | Everyone who joins is let straight in. Turns the list into pure lead capture — you keep the emails, the queue numbers and the attribution, but nobody is actually held. Good for a soft launch. |
| **Send waiting-list emails** | The confirmation and the approval emails. Needs `RESEND_API_KEY` + `EMAIL_FROM`; without them sends are skipped silently either way (fail-open, like every other sender). |

---

## Abuse handling

- **Honeypot** field on both forms; a filled one gets a fake success and writes nothing.
- **IP throttle**: 8 joins/hour per address (`RL_WAITLIST_JOIN_PER_HOUR`), via
  `consume_anon_action`. The IP is never stored — only a salted SHA-256, and only
  for forensics.
- **Unique on `lower(email)`**: re-submitting is a success that updates the
  existing row, never a duplicate. A re-submit can never overwrite an admin
  decision or a queue position.
- Every admin mutation (toggle, approve, reject, delete, bulk, export) is written
  to `admin_audit_log` with IP and user agent.

---

## Data

`waitlist_entries` — RLS on, **no policies**: reachable only through the
service-role client, same posture as `app_settings` and `app_events`. Nothing on
the marketing site or in a browser can read the list.

Key columns: `email` (normalized lowercase), `user_id` (linked on first sign-in),
`queue_number` (identity — the stable ticket shown as "#47"), `status`, the
qualification fields, `utm`, `ip_hash`, `admin_note`, `reviewed_by`, and the
three decision timestamps.

"You're 46th in line" is **computed**, not stored: it counts `pending` entries
with a lower ticket, so it shrinks every time a batch goes in. The ticket itself
never moves.

---

## Where the code lives

| Piece | File |
|---|---|
| Flag read + OFF→ON stamping | `lib/waitlist/flag.ts` |
| Access rules | `lib/waitlist/access.ts` |
| Dashboard gate (one line in the layout) | `lib/waitlist/guard.ts` |
| Idempotent join / normalization | `lib/waitlist/entry.ts` |
| Status transitions + CSV | `lib/waitlist/review.ts` |
| Emails | `lib/waitlist/email.ts` |
| Public API | `app/api/waitlist/route.ts` |
| Admin API | `app/api/admin/waitlist/**` |
| Admin UI | `app/admin/waitlist/`, `components/admin/waitlist/` |
| Pending screen + join form | `app/waitlist/`, `components/waitlist/` |
| Marketing CTA interception | `reelspy-landing`: `components/ui/CTALink.tsx`, `components/landing/waitlist/` |
| Marketing flag fetch | `reelspy-landing`: `lib/waitlist.ts` |
| Tests | `test/waitlist/`, landing `test/sections/waitlist.test.tsx` |

The marketing site learns the flag state by fetching `DASHBOARD_URL/api/waitlist`
at render (60s revalidate, fails to "off"). The join form posts to `/api/waitlist`,
which the multi-zone rewrites proxy to this app — so it's same-origin from the
browser and needs no CORS setup.
