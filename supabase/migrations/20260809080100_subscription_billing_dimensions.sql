-- Billing dimensions on the subscriptions row, for the admin-managed catalog.
--
-- stripe_price_id is the important one: it records the EXACT price a subscriber
-- is on, not just their tier. That is what makes grandfathering answerable —
-- "who is still on the old price?" becomes one indexed query instead of crawling
-- Stripe — and it is what the price-migration job selects on.
--
-- billing_currency / billing_interval pin the two dimensions Stripe locks for a
-- subscription's lifetime. A subscriber's currency can never change, so every
-- price we quote them must be resolved in the currency recorded here rather than
-- the one their IP suggests.
--
-- All nullable and additive: lib/billing/sync.ts drops unknown column groups and
-- retries, so a database without this migration still gets its tier written.
alter table subscriptions
  add column if not exists stripe_price_id text,
  add column if not exists billing_currency text,
  add column if not exists billing_interval text,
  -- Trials: when the current trial ends, and whether this customer has ever had
  -- one (Stripe has no per-customer trial lock for Checkout, so we enforce it).
  add column if not exists trial_ends_at timestamptz,
  add column if not exists trial_used_at timestamptz,
  -- Scheduled-change cache, widened. pending_price_aed is AED-only and in MAJOR
  -- units; these replace it and are kept alongside it until it is dropped.
  add column if not exists pending_price_id text,
  add column if not exists pending_amount_minor int,
  add column if not exists pending_currency text,
  add column if not exists pending_interval text;

create index if not exists subscriptions_price_idx on subscriptions (stripe_price_id);
