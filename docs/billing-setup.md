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

Run `supabase/migrations/20260703000003_billing.sql` then
`supabase/migrations/20260708000000_custom_plan.sql` in the Supabase SQL editor.
Together they create:

- `subscriptions` — one row per user, owner-readable (RLS), written only by the
  service-role webhook. `custom_entitlements` (jsonb) carries a "custom" plan
  subscriber's own limits + model (see §6).
- `user_monthly_usage` + `consume_user_action_monthly(...)` — the calendar-month
  quota enforcing per-tier scripts/month and transcripts/month.

Until this runs, tier resolution and quotas **fail open** (everyone resolves to
`AI_DEFAULT_TIER`, monthly caps are not enforced) — nothing breaks, but nobody
is actually metered or upgraded.

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
- Events: `checkout.session.completed`,
  `customer.subscription.created`, `customer.subscription.updated`,
  `customer.subscription.deleted`

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
```

A tier with no `STRIPE_PRICE_*` set is simply not offered for purchase. Redeploy
after changing env in Vercel.

## 5. Verify

1. `STRIPE_SECRET_KEY` set → `/dashboard/billing` drops the "payments aren't
   live" banner and the Upgrade buttons enable.
2. Use a Stripe test card (`4242 4242 4242 4242`) to subscribe. On return you
   land on `/dashboard/billing?checkout=success`.
3. Within a few seconds the webhook flips the `subscriptions` row to the tier +
   `active`; the sidebar plan badge and usage meters update on next load.
4. Local webhook testing: `stripe listen --forward-to
   localhost:3000/api/stripe/webhook` and use the `whsec_…` it prints.

## 6. The dynamic "build your own plan" card

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
