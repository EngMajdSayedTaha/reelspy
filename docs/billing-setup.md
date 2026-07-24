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

Together they create:

- `subscriptions` — one row per user, owner-readable (RLS), written only by the
  service-role webhook. `custom_entitlements` (jsonb) carries a "custom" plan
  subscriber's own limits + model (see §9).
- `user_monthly_usage` + `consume_user_action_monthly(...)` — the calendar-month
  quota enforcing per-tier scripts/month and transcripts/month.
- `billing_events` — webhook **idempotency** log: one row per fully-processed
  Stripe event id, so a redelivered/duplicate event is a no-op (see §7).

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
  - `customer.subscription.updated`
  - `customer.subscription.deleted` — cancellation email + tier → free
  - `invoice.payment_succeeded` — welcome (first invoice) / receipt (renewals)
  - `invoice.payment_failed` — dunning email
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
```

A tier with no `STRIPE_PRICE_*` set is simply not offered for purchase. Redeploy
after changing env in Vercel.

## 5. Verify (test-mode runbook)

Run everything against **test-mode** keys (`sk_test_…`) first. The admin billing
page shows a "Stripe test mode" badge and deep-links to the `/test` dashboard
when the key is a test key.

1. `STRIPE_SECRET_KEY` set → `/dashboard/billing` drops the "payments aren't
   live" banner and the Upgrade buttons enable.
2. Start the local webhook forwarder and paste the `whsec_…` it prints into
   `STRIPE_WEBHOOK_SECRET`:
   ```
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```
3. Subscribe with test card `4242 4242 4242 4242` (any future expiry / any CVC).
   On return you land on `/dashboard/billing?checkout=success`.
4. Within a few seconds the webhook flips the `subscriptions` row to the tier +
   `active`; the sidebar plan badge and usage meters update on next load. A
   **welcome email** is sent (check Resend logs, or the `[email] skipped` console
   line if Resend isn't configured).
5. Exercise the rest of the lifecycle with the Stripe CLI:
   ```
   stripe trigger invoice.payment_failed      # → dunning email
   stripe trigger charge.refunded             # → refund email
   stripe trigger customer.subscription.deleted  # → cancellation email + tier→free
   ```
   Useful failing-payment card: `4000 0000 0000 0341` (attaches, then fails on
   the renewal charge).
6. **Idempotency:** replay the same event twice (re-run a `stripe trigger`, or use
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
| Payment failed (dunning) | `invoice.payment_failed` | customer |
| Subscription cancelled | `customer.subscription.deleted` | customer |
| Refund issued | `charge.refunded` | customer |
| Dispute alert | `charge.dispute.created` | `BILLING_ALERT_EMAIL` |

Stripe's own card receipt (Dashboard → Settings → Emails) is complementary — the
app emails are branded + deep-linked; leave Stripe receipts on if you want a
formal PDF receipt too.

## 7. Cancel, switch & refunds

- **Cancel / switch plan / update card** — the customer self-serves via the
  **Stripe Billing Portal** (opened from the billing page). Enable plan switching
  + set proration behaviour in Dashboard → Settings → Billing → Customer portal.
  Switches prorate automatically; cancels set `cancel_at_period_end` and the
  billing page then shows "Cancels on …".
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

## 10. The dynamic "build your own plan" card

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
  `subscription_data.metadata.custom_entitlements`.
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
