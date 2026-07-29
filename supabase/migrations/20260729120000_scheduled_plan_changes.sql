-- Deferred (end-of-period) plan changes. A subscriber who upgrades, downgrades
-- or re-configures their custom plan mid-cycle KEEPS the plan they already paid
-- for until the current billing period ends; the new plan starts on the next
-- renewal date. The change itself lives in a Stripe Subscription Schedule (the
-- authoritative record — see lib/billing/schedule.ts); these columns are the
-- cached mirror the billing page renders without a Stripe round-trip, written
-- by the same service-role webhook that owns the rest of the row.
--
-- All nullable: a row with pending_tier IS NULL simply has no scheduled change,
-- which is the state every existing row starts in. Nothing here gates access —
-- `tier` still means "what this user can do RIGHT NOW", so entitlements are
-- untouched until Stripe actually advances the schedule phase.

alter table subscriptions
  -- The Stripe Subscription Schedule (sub_sched_…) holding the future phase.
  add column if not exists stripe_schedule_id text,
  -- Tier that takes over at pending_effective_at ('creator' | 'pro' | 'studio' |
  -- 'custom' | 'free'-as-cancellation is expressed via cancel_at_period_end).
  add column if not exists pending_tier text,
  -- When the scheduled change starts = the current period end at scheduling time.
  add column if not exists pending_effective_at timestamptz,
  -- Indicative monthly AED price of the pending plan (display only; Stripe is
  -- the source of truth for what actually gets charged).
  add column if not exists pending_price_aed int,
  -- Limits + model the pending plan will grant when it starts. Only set when
  -- pending_tier = 'custom'; fixed tiers read from ENTITLEMENTS.
  add column if not exists pending_custom_entitlements jsonb;
