# Billing setup (Stripe) — L6 / B1

ReelSpy subscriptions run on Stripe Checkout + the Billing Portal, with a
signature-verified webhook as the **sole writer** of the `subscriptions` table.
Everything degrades gracefully until keys are set: the billing page shows plans
in preview mode, and the checkout/portal/webhook routes return `503`. The app
builds and runs with no Stripe config at all.

## 0. Prerequisites

- Stripe account approved for the UAE (this is the long pole — start the
  application early; the code does not depend on it).
- Ability to run SQL in the Supabase dashboard (this machine has no DDL access,
  so migrations are applied by hand there).

## 1. Apply the database migrations

Run these in order in the Supabase SQL editor (or via the Supabase MCP
`apply_migration`):

1. `supabase/migrations/20260703000003_billing.sql`
2. `supabase/migrations/20260708000000_custom_plan.sql`
3. `supabase/migrations/20260724101832_billing_events.sql`
4. `supabase/migrations/20260729120000_scheduled_plan_changes.sql`

Together they create:

- `subscriptions` — one row per user, owner-readable (RLS), written only by the
  service-role webhook. `custom_entitlements` (jsonb) carries a "custom" plan
  subscriber's own limits + model (see §9).
- `user_monthly_usage` + `consume_user_action_monthly(...)` — the calendar-month
  quota enforcing per-tier scripts/month and transcripts/month.
- `billing_events` — webhook **idempotency** log: one row per fully-processed
  Stripe event id, so a redelivered/duplicate event is a no-op (see §8).
- `subscriptions.pending_*` + `stripe_schedule_id` — the cached mirror of a
  **plan change scheduled for the next renewal** (see §7a). Nullable and never
  gating access, so a database without the fourth migration behaves as before.

Until these run, tier resolution and quotas **fail open** (everyone resolves to
`AI_DEFAULT_TIER`, monthly caps are not enforced, dedupe is skipped) — nothing
breaks, but nobody is actually metered or upgraded.

## 2. Create the products & prices in Stripe

Create one **recurring** Price per paid tier (monthly). Tiers and indicative AED
pricing (see `lib/billing/plans.ts` / `lib/billing/entitlements.ts`):

| Tier    | Price (AED/mo) | Accounts | Scripts/mo | Transcripts/mo | Auto-replies | Publish targets | Model  |
|---------|----------------|----------|------------|----------------|---------------|------------------|--------|
| Creator | 49             | 30       | 60         | 30             | 15            | 1                | Sonnet |
| Pro     | 149            | 50       | 200        | 100            | 30            | 4                | Opus   |
| Studio  | 349            | 100      | Unlimited  | Unlimited      | 60            | 4                | Opus   |

Copy each Price id (`price_…`). The display price on the billing page is cosmetic
— Stripe's configured amount is what's actually charged.

> **Pricing review note (marketing):** these limits were raised substantially
> (accounts 2-3x, auto-replies 2-5x) without changing price, and Creator was
> moved from Haiku onto Sonnet. That's a deliberate call to lower the barrier
> to paying, but it also flattens the Creator→Pro upsell to "more of the same"
> and raises COGS on the cheapest tier — sanity-check against real unit
> economics before this goes live. Pro/Studio now differentiate on model
> (Opus) instead, which keeps *that* upsell lever intact.

## 3. Configure the webhook

Stripe Dashboard → Developers → Webhooks → add endpoint:

- URL: `https://<your-domain>/api/stripe/webhook`
- Events:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated` — **also where a scheduled plan change lands**
    (Stripe advances the schedule phase at the renewal) → tier moves + "your new
    plan is live" email; also cancellation-scheduled / resumed emails
  - `customer.subscription.deleted` — cancellation email + tier → free
  - `invoice.payment_succeeded` — welcome (first invoice) / receipt (renewals)
  - `invoice.payment_failed` — dunning email
  - `invoice.upcoming` — advance renewal reminder (and the final heads-up before
    a scheduled plan change takes effect)
  - `charge.refunded` — refund email; a **full** refund also cancels the sub
  - `charge.dispute.created` — founder alert to `BILLING_ALERT_EMAIL`

Copy the signing secret (`whsec_…`).

## 4. Set environment variables

In `.env.local` and Vercel (Production + Preview):

```
STRIPE_SECRET_KEY=sk_live_...          # or sk_test_ while testing
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_CREATOR=price_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_STUDIO=price_...
NEXT_PUBLIC_SITE_URL=https://<your-domain>   # optional; pins Checkout return URLs

# Billing emails (Resend) — optional but recommended. Without these, billing
# emails silently no-op (fail-open) and only Stripe's own card receipts go out.
RESEND_API_KEY=re_...
EMAIL_FROM="ReelSpy <billing@your-domain>"
BILLING_ALERT_EMAIL=you@your-domain      # dispute alerts; falls back to EMAIL_FROM

# Optional: an existing Stripe Product to hang ad-hoc custom-plan prices off
# (see §7a). Unset simply means one product per distinct custom price point.
STRIPE_PRODUCT_CUSTOM=prod_...
```

A tier with no `STRIPE_PRICE_*` set is simply not offered for purchase. Redeploy
after changing env in Vercel.

## 5. Verify (test-mode runbook)

Run everything against **test-mode** keys (`sk_test_…`) first. The admin billing
page shows a "Stripe test mode" badge and deep-links to the `/test` dashboard
when the key is a test key.

1. `STRIPE_SECRET_KEY` set → `/dashboard/billing` drops the "payments aren't
   live" banner and the Upgrade buttons enable.
2. Start the local webhook forwarder. Stripe can't reach `localhost`, so without
   one nothing in the lifecycle ever reaches the app:
   ```
   npm run stripe:forward
   ```
   `scripts/stripe-forward.mjs` polls the Stripe Events API and re-delivers each
   event to `/api/stripe/webhook`, signed with your `STRIPE_WEBHOOK_SECRET` the
   same way Stripe signs a real delivery — so signature verification is genuinely
   exercised, and **no Stripe CLI install is required**. Any `whsec_…` value works
   as long as the script and the app read the same one. Add `--since 30` to also
   replay the last 30 minutes (safe — the webhook dedupes).
   `stripe listen --forward-to localhost:3000/api/stripe/webhook` remains a drop-in
   alternative if you do have the CLI.
3. Subscribe with test card `4242 4242 4242 4242` (any future expiry / any CVC).
   On return you land on `/dashboard/billing?checkout=success`, which reconciles
   the subscription straight from Stripe — so the new plan shows up on that first
   render even if the webhook hasn't landed (or isn't being forwarded at all).
4. The webhook then flips the `subscriptions` row to the tier + `active`
   (idempotently re-writing what the reconcile already wrote); the sidebar plan
   badge and usage meters update on next load. A **welcome email** is sent (check
   Resend logs, or the `[email] skipped` console line if Resend isn't configured).
5. Exercise the rest of the lifecycle. With the Stripe CLI:
   ```
   stripe trigger invoice.payment_failed      # → dunning email
   stripe trigger charge.refunded             # → refund email
   stripe trigger customer.subscription.deleted  # → cancellation email + tier→free
   ```
   Without it, drive the same states through the API/dashboard and let
   `npm run stripe:forward` relay them. Useful failing-payment fixtures: card
   `4000 0000 0000 0341` (attaches, then fails on the renewal charge), or test
   token `tok_chargeCustomerFail` when creating the subscription via the API.
6. **Upgrade (§7a).** As the subscribed test user, pick a MORE expensive plan.
   Expect: the dialog quotes a prorated amount from `/api/billing/preview`, the
   switch is instant, Stripe raises a `subscription_update` invoice for that same
   amount, and the "you're now on …" email states what was charged today and the
   full price from the next renewal.
7. **Downgrade (§7a).** Now pick a CHEAPER plan and confirm. Expect: no charge,
   no change to limits, the
   billing page shows "Scheduled: your plan changes to … on <renewal date>", the
   target plan's card is badged *Scheduled*, and a "plan change scheduled" email
   goes out. In Stripe the subscription now has a schedule with two phases —
   phase 0 must still carry the ORIGINAL price and the original period dates.
   Then either "Keep my current plan" (schedule released, plan unchanged) or
   advance the test clock past the period end and watch
   `customer.subscription.updated` flip the tier and send "you're now on …".
   Stripe **test clocks** (Dashboard → Billing → Test clocks, or a customer
   created with `test_clock`) are the only way to see the phase transition
   without waiting a month.
8. **Idempotency:** replay the same event twice (re-run a `stripe trigger`, or use
   "Resend" in the dashboard). The second delivery returns `{received:true,
   deduped:true}` and does **not** re-send the email or re-write the row — verify
   one row per `event.id` in `billing_events`.

## 6. Billing emails

Composed in `lib/email/billing.ts` over the existing Resend wrapper
(`lib/email/send.ts`); all **fail-open** (no `RESEND_API_KEY`/`EMAIL_FROM` ⇒ they
log and no-op). Sent by the webhook, keyed to Stripe events:

| Email | Trigger | To |
|-------|---------|----|
| Welcome / plan active | `invoice.payment_succeeded`, `billing_reason=subscription_create` | customer |
| Payment receipt | `invoice.payment_succeeded`, renewals | customer |
| Renewal reminder | `invoice.upcoming` | customer |
| Prorated upgrade receipt | `invoice.payment_succeeded`, `billing_reason=subscription_update` | customer |
| Payment failed (dunning) | `invoice.payment_failed` | customer |
| Plan change scheduled | user books a downgrade for the next renewal | customer |
| Plan change applied | an upgrade goes live now, or a booked change reaches its date | customer |
| Plan change cancelled | user keeps their current plan | customer |
| Cancellation scheduled | `cancel_at_period_end` false → true | customer |
| Subscription resumed | `cancel_at_period_end` true → false | customer |
| Subscription cancelled | `customer.subscription.deleted` | customer |
| Refund issued | `charge.refunded` | customer |
| Dispute alert | `charge.dispute.created` | `BILLING_ALERT_EMAIL` |

All of them render through the shared branded template
(`lib/email/layout.ts` — logo header, details table, CTA, support/legal footer,
HTML + plain text). See [`email-templates.md`](./email-templates.md), which also
carries the matching Supabase auth templates.

The state-change emails (plan applied, cancellation scheduled, resumed) are
decided by **diffing** the row we're about to write against the row as it was
(`lib/billing/notify.ts`), not by trusting the caller — so a cancellation made in
the Stripe portal or dashboard notifies exactly like one made in-app. Both the
webhook and the in-app routes run that diff after syncing; whichever sees the
transition first sends, the other sees no diff and stays quiet.

Stripe's own card receipt (Dashboard → Settings → Emails) is complementary — the
app emails are branded + deep-linked; leave Stripe receipts on if you want a
formal PDF receipt too.

## 7a. Plan changes: up now, down at the renewal

**The policy.**

- **Upgrade** (the new plan costs **more**) — applies **immediately**. The
  customer asked for more capacity, so they get it now, and Stripe invoices only
  the **prorated difference** for the days left in the current period, crediting
  the unused time on the old plan. They never pay twice for the same days.
- **Downgrade or a same-price change** (the new plan costs the **same or less**)
  — applies at the **end of the period they already paid for**. They keep the
  plan they bought, with its limits and its AI model, until the day it runs out;
  the cheaper plan starts at the next renewal. Nothing is prorated, refunded or
  taken away early.
- **Cancellation** is always end-of-period (§7b).

**Which one applies is decided from the real Stripe amounts**, not from the order
of the cards on the pricing page (`decidePlanChangeMode` in
`lib/billing/plan-change.ts`): the configured Price of the target vs. the amount
the subscription bills today. That's what makes it correct for the custom plan —
which has no place on the tier ladder — and for any tier whose Stripe Price
differs from the number printed on the card. When the amounts aren't comparable
(missing, or different currencies) it falls back to the tier ladder, and an
unrankable change **defers** rather than charging.

**The upgrade path** is a plain `subscriptions.update` with
`proration_behavior: "always_invoice"`, so the difference is billed there and
then instead of being parked on the next invoice. Any pending downgrade schedule
is released first — Stripe refuses item updates on a schedule-managed
subscription, and a leftover phase would drag the customer back down later.

**The deferred path** (`lib/billing/schedule.ts`) is a Stripe **Subscription
Schedule**: phase 0 reproduces the current period verbatim (same price, same
dates), phase 1 starts the moment phase 0 ends with the new price and
`end_behavior: release`, so once the new phase has run an interval Stripe hands
the subscription back and it continues on the new price forever. Because our
`tier` column only moves when `customer.subscription.updated` reports a new
price, entitlements can't change early even if the UI, the cache or a webhook is
late.

- `POST /api/billing/checkout` — no subscription yet ⇒ Stripe Checkout (starts
  now, nothing to protect). Already subscribed ⇒ upgrade now
  (`{ upgraded: true, chargedLabel, … }`) or schedule it
  (`{ scheduled: true, effectiveOnLabel, … }`). Picking the plan you're already
  on means "keep it" and cancels a scheduled change or pending cancellation.
- `POST /api/billing/preview` — read-only twin of the above: runs the same
  decision and asks Stripe for the exact proration, so the confirmation dialog
  can quote the real figure ("You'll be charged AED 63.42 today") instead of a
  hedge. Computed from the upcoming invoice's proration line items, not its
  `amount_due` (which also carries the next cycle's charge). If it fails, the
  dialog still opens with generic wording — a preview never blocks a change.
- `POST /api/billing/plan` — `keep_current` (drop a scheduled change), `cancel`
  (end at period end), `resume` (undo that).
- `subscriptions.pending_tier` / `pending_effective_at` / `pending_price_aed` /
  `pending_custom_entitlements` / `stripe_schedule_id` cache what's scheduled so
  the billing page renders it without a Stripe round-trip. The schedule itself is
  the source of truth; the cache is refreshed on every sync and is only cleared
  when Stripe proves there's nothing scheduled.
- **Custom plans** need a real Price object (schedule phases can't take inline
  `price_data`), so one recurring AED price per distinct amount is created and
  reused via `lookup_key: reelspy_custom_aed_<amount>`. Set the optional
  `STRIPE_PRODUCT_CUSTOM` env to hang them all off one product instead of one
  product per price point.
- The UI states both halves of the rule permanently ("How plan changes work")
  **and** repeats the relevant half inside every confirmation dialog, with the
  exact amount and the exact date.

> **Stripe Customer portal setting.** Turn **plan switching OFF** in
> Dashboard → Settings → Billing → Customer portal. The portal switches plans
> with its own proration settings and would let a downgrade take effect
> mid-period — bypassing the half of the policy that protects the paid period.
> Keep payment-method updates, invoice history and (optionally) cancellation
> enabled: a portal cancellation is `cancel_at_period_end` and is handled
> identically to an in-app one.

## 7b. Cancel, switch & refunds

- **Switch plan / cancel / resume** — done in-app on `/dashboard/billing`, behind
  confirmation dialogs (§7a). Cancellation sets `cancel_at_period_end`, so access
  continues to the paid-through date and the page shows "Your plan ends on …"
  with a one-click resume.
- **Update card / invoice history** — the **Stripe Billing Portal**, opened from
  the billing page.
- **Refunds** — admins issue them from **Admin → Billing → Refund** (or the Stripe
  dashboard; both behave identically). Policy: a **full** refund cancels the
  subscription immediately and drops the user to Free; a **partial** refund leaves
  access intact. The UI button does full refunds — for a partial amount use the
  Stripe dashboard. All refund side effects (email, tier downgrade) flow through
  the `charge.refunded` webhook, and the action is written to `admin_audit_log`
  (`action: billing.refund`).
- **Disputes / chargebacks** — `charge.dispute.created` emails the founder
  (`BILLING_ALERT_EMAIL`) so someone responds before Stripe's evidence deadline.

## 8. Webhook idempotency

Stripe delivers every event **at least once** (it retries on any non-2xx and
occasionally re-sends). The webhook records each fully-processed `event.id` in
`billing_events` and skips any id already marked processed. The record is written
**after** the handler succeeds, so an event that errors (returns 500) is left
un-recorded and Stripe's automatic retry reprocesses it. Individual handlers are
idempotent (upserts), so a rare duplicate that races the guard is harmless.

## 9. API-version robustness

The Stripe client is pinned to `apiVersion 2025-02-24.acacia` (`lib/billing/stripe.ts`),
but a webhook endpoint renders event payloads at **its own** configured version —
which for a new account/CLI defaults to a *newer* version (e.g. `2026-06-24.dahlia`)
where fields like `current_period_end`, `invoice.subscription`, and `line.price`
have moved. To stay correct regardless of the endpoint version, the webhook
**re-fetches** the canonical subscription/invoice through the pinned client
(`canonicalSub()` + `stripe.invoices.retrieve` in `app/api/stripe/webhook`) instead
of trusting the raw event payload's shape. When creating the production endpoint you
can additionally pin it to `2025-02-24.acacia`, but the re-fetch makes that optional.

## 10. Stale Stripe references (self-healing)

Our `subscriptions` row caches a `stripe_customer_id` / `stripe_subscription_id`.
Either can stop existing on Stripe's side — a customer deleted in the dashboard,
or every id at once after a test↔live key switch. Passing a dead id to Checkout
returns `No such customer` and the user is stuck on "Could not start checkout"
forever, with nothing in the UI to clear it.

So every path that reuses a cached id verifies it first (`usableCustomerId` in
`lib/billing/sync.ts`, `isMissingResource` in `lib/billing/stripe.ts`):

- **Checkout** — dead customer ⇒ clear the row and mint a fresh customer; dead
  subscription on a "switch plan" ⇒ fall through to a normal Checkout instead of
  erroring.
- **Billing portal** — dead customer ⇒ "No billing account yet — subscribe first".
- **Admin sync** — a missing subscription id falls back to "whatever this customer
  has now" rather than throwing.

## 11. Status → access, in one place

`ACTIVE_STATUSES` (`lib/billing/subscription.ts`) is the single definition of
"this subscription is paying": `active`, `trialing`, `past_due`. The webhook's
writer derives *inactive* as the complement of that set (`grantsAccess()` in
`lib/billing/sync.ts`) instead of keeping a second list, so the row we write can
never advertise a tier the read path would refuse to honour — and an unfamiliar
status (`incomplete`, `paused`, anything Stripe adds later) defaults to no access
rather than silently granting a plan that was never paid for.

## 12. The dynamic "build your own plan" card

The billing page also renders a slider-driven custom plan
(`components/billing/DynamicPlanCard.tsx`): the user picks tracked accounts,
scripts/month (or unlimited), auto-replies, publish targets, and Sonnet vs
Opus, and sees a live estimated price. There's nothing to configure in Stripe
for this — no fixed Price object exists for "custom":

- Pricing + the resulting entitlements are pure functions in
  `lib/billing/custom-pricing.ts`, imported by both the client (live preview)
  and the checkout route (authoritative — the client's number is never
  trusted).
- `POST /api/billing/checkout` with `{ tier: "custom", config }` creates a
  Stripe Checkout session using an **ad-hoc `price_data` line item** (no
  pre-created Price) and stamps the computed entitlements as JSON into
  `subscription_data.metadata.custom_entitlements`. For a user who is **already
  subscribed**, the same request instead schedules the custom plan for the next
  renewal (§7a) — including a custom→custom reconfiguration, which is a real
  change of price and limits, so it is never treated as "keep your plan".
- Because the ad-hoc price never matches a known `STRIPE_PRICE_*` id, the
  webhook's existing price→tier lookup falls through to the metadata tier
  (`"custom"`) with no code changes needed there beyond persisting
  `custom_entitlements` onto the `subscriptions` row.
- `lib/billing/resolve.ts` (`resolveUserEntitlements`) is what every
  enforcement chokepoint should call for a signed-in user: it returns the
  fixed-tier entitlements for everyone else, or the custom subscriber's own
  row for `tier === "custom"`, falling back to `ENTITLEMENTS.custom` (Creator-
  level) for the few seconds between checkout and the webhook landing.

The custom pricing formula (base + per-unit rates + a flat Opus premium + an
8% "build-your-own" premium so a custom config is never cheaper than the
equivalent fixed tier) is a first pass calibrated to land close to the three
fixed tiers' prices — see the comment at the top of `custom-pricing.ts`. Get
finance/founder sign-off on the actual rates before launch.

## How tier flows through the app

`resolveUserTier` (`lib/ai/tier.ts`) reads the active subscription; an active
paid sub wins, otherwise it falls back to `AI_DEFAULT_TIER`. `resolveUserEntitlements`
(`lib/billing/resolve.ts`) wraps it to also resolve the *actual* entitlements —
required for a `"custom"` subscriber, since their limits live on their own
subscription row rather than the fixed `ENTITLEMENTS` table. Entitlements
drive both **AI model routing** (free → NVIDIA/Haiku, Creator → Sonnet,
Pro/Studio/custom → Sonnet or Opus per `entitlements.model`) and **feature
caps** (`lib/billing/entitlements.ts`), enforced at four chokepoints:

- tracked accounts — `app/dashboard/accounts/actions.ts` (+ onboarding/trends
  entry points)
- scripts/month — `app/api/generate-script/route.ts`
- transcripts/month — per-reel transcript + `reel-from-link` routes +
  `lib/media/transcribe-job.ts`
- auto-replies — `app/dashboard/automations/actions.ts`

The webhook is the only writer of `subscriptions`; clients can read their own row
but never write it, so a tier (or a custom entitlement set) can't be forged
from the browser.
