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

## 1. Apply the database migration

Run `supabase/migrations/20260703d_billing.sql` in the Supabase SQL editor. It
creates:

- `subscriptions` — one row per user, owner-readable (RLS), written only by the
  service-role webhook.
- `user_monthly_usage` + `consume_user_action_monthly(...)` — the calendar-month
  quota enforcing per-tier scripts/month and transcripts/month.

Until this runs, tier resolution and quotas **fail open** (everyone resolves to
`AI_DEFAULT_TIER`, monthly caps are not enforced) — nothing breaks, but nobody
is actually metered or upgraded.

## 2. Create the products & prices in Stripe

Create one **recurring** Price per paid tier (monthly). Tiers and indicative AED
pricing (see `lib/billing/plans.ts`):

| Tier    | Price (AED/mo) | Accounts | Scripts/mo | Transcripts/mo | Auto-replies |
|---------|----------------|----------|------------|----------------|--------------|
| Creator | 49             | 10       | 60         | 30             | 3            |
| Pro     | 149            | 25       | 200        | 100            | 10           |
| Studio  | 349            | 50       | Unlimited  | Unlimited      | 30           |

Copy each Price id (`price_…`). The display price on the billing page is cosmetic
— Stripe's configured amount is what's actually charged.

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

## How tier flows through the app

`resolveUserTier` (`lib/ai/tier.ts`) reads the active subscription; an active
paid sub wins, otherwise it falls back to `AI_DEFAULT_TIER`. That single tier
drives both **AI model routing** (free → NVIDIA, paid → Claude) and **feature
entitlements** (`lib/billing/entitlements.ts`), enforced at four chokepoints:

- tracked accounts — `app/dashboard/accounts/actions.ts`
- scripts/month — `app/api/generate-script/route.ts`
- transcripts/month — per-reel transcript + `reel-from-link` routes
- auto-replies — `app/dashboard/automations/actions.ts`

The webhook is the only writer of `subscriptions`; clients can read their own row
but never write it, so a tier can't be forged from the browser.
