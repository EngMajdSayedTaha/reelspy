-- Admin-managed plan catalog.
--
-- Until now every commercial decision was a code change: prices lived in
-- lib/billing/plans.ts, limits in lib/billing/entitlements.ts, and the customer-
-- facing name/tagline/bullets a THIRD time in lib/i18n/dictionaries/billing.ts
-- (en + ar). Three files that had to be edited together, in a deploy, or what a
-- customer was shown drifted from what they were charged.
--
-- These tables become the source of truth. The hardcoded constants survive as
-- the fail-open fallback (lib/billing/catalog.ts): a database without this
-- migration, or one with no published plans, behaves exactly as before.
--
-- Service-role only — RLS on with NO policies and grants revoked from the
-- browser roles, the same lockdown as app_settings / admin_audit_log. Justified:
-- the only customer-facing surface (app/dashboard/billing/page.tsx) is a Server
-- Component and DynamicPlanCard takes props, so the browser never reads these
-- directly; and draft plans plus historical prices must not leak. If the
-- marketing zone ever needs prices, add a cached public route handler filtered
-- to published + current rather than opening RLS.

-- ── plans ───────────────────────────────────────────────────────────────────
create table if not exists plans (
  id uuid primary key default gen_random_uuid(),
  -- Stored in subscriptions.tier. Immutable once any subscription references it.
  slug text not null unique,
  -- 'free'   = the no-charge tier, 'fixed' = a normal priced plan,
  -- 'custom' = the build-your-own card, whose price comes from a rate card
  --            rather than a plan_prices row (see custom_pricing).
  kind text not null default 'fixed' check (kind in ('free', 'fixed', 'custom')),
  -- Draft plans are invisible to customers and rejected by checkout, which is
  -- how an admin builds a plan fully before it goes live.
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  -- Card order on the billing page AND the fallback upgrade/downgrade ladder
  -- used when Stripe amounts aren't comparable (lib/billing/format.ts).
  sort_order int not null default 100,
  -- The Entitlements shape, validated by coerceEntitlements() — the same
  -- validator already guarding subscriptions.custom_entitlements. Kept as jsonb
  -- so a future entitlement key is code + backfill, not a migration.
  entitlements jsonb not null,
  trial_days int not null default 0,
  default_currency text not null default 'aed',
  -- The Stripe Product every price for this plan hangs off. Needed so a coupon
  -- can be restricted to specific plans via applies_to.products.
  stripe_product_id text,
  -- Exactly one row carries this: the plan an admin (profiles.is_admin) resolves
  -- to, replacing the hardcoded "studio" in resolveUserTier. Without it,
  -- renaming or archiving Studio would silently drop every admin to a mid plan.
  admin_grant boolean not null default false,
  -- Build-your-own rate card; only meaningful when kind = 'custom'.
  custom_pricing jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists plans_visible_idx on plans (status, sort_order);
-- At most one admin-grant plan, enforced in the database rather than in code.
create unique index if not exists plans_admin_grant_idx on plans (admin_grant) where admin_grant;

-- ── plan_copy ───────────────────────────────────────────────────────────────
-- Customer-facing copy, per locale. Replaces the duplicated blocks in the i18n
-- dictionaries; those stay only as fallback copy for the built-in slugs.
create table if not exists plan_copy (
  plan_id uuid not null references plans(id) on delete cascade,
  locale text not null check (locale in ('en', 'ar')),
  name text not null,
  tagline text not null default '',
  highlights jsonb not null default '[]'::jsonb,   -- string[]
  badge text,                                       -- e.g. "Most popular"
  primary key (plan_id, locale)
);

-- ── plan_prices ─────────────────────────────────────────────────────────────
-- One row = one Stripe Price. Stripe Prices are IMMUTABLE in amount, so editing
-- a price mints a new Price and a new row here, and demotes the old one.
--
-- Old rows are kept FOREVER (is_current = false, archived_at still null). They
-- are how a grandfathered subscriber's price still resolves to their plan: the
-- catalog's reverse lookup indexes every row regardless of is_current, and
-- without that the Stripe webhook would mis-assign a tier to every subscriber
-- still paying an older price.
--
-- interval and currency are here from the start even though only ('month','aed')
-- is populated today, so annual plans and multi-currency add rows, not columns.
create table if not exists plan_prices (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plans(id) on delete cascade,
  interval text not null default 'month' check (interval in ('month', 'year')),
  currency text not null default 'aed' check (currency in ('aed', 'sar', 'usd')),
  -- MINOR units (fils/cents), matching Stripe exactly so no conversion can drift.
  unit_amount int not null check (unit_amount >= 0),
  -- The struck-through "was" figure for a sale. Display only — unit_amount is
  -- always what is charged.
  compare_at_amount int check (compare_at_amount is null or compare_at_amount > unit_amount),
  sale_ends_at timestamptz,
  -- Which price this one reverts to when the sale ends.
  reverts_to_price_id uuid references plan_prices(id) on delete set null,
  stripe_price_id text not null unique,
  is_current boolean not null default true,
  -- Set only when the whole plan is retired; NOT set by a price edit.
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
-- One live price per plan/interval/currency.
create unique index if not exists plan_prices_current_idx
  on plan_prices (plan_id, interval, currency) where is_current;
create index if not exists plan_prices_lookup_idx on plan_prices (stripe_price_id);
create index if not exists plan_prices_plan_idx on plan_prices (plan_id);

-- ── plan_promotions ─────────────────────────────────────────────────────────
-- Local mirror of Stripe coupons + promotion codes. Stripe stays the source of
-- truth for redemption; this exists so the admin list is one query instead of N
-- Stripe calls, so a promo can be restricted to specific plans, and so a
-- deactivated promo is still auditable.
create table if not exists plan_promotions (
  id uuid primary key default gen_random_uuid(),
  stripe_coupon_id text not null,
  stripe_promotion_code_id text,
  code text,
  percent_off numeric(5, 2),
  amount_off int,
  amount_off_currency text,
  duration text not null default 'once' check (duration in ('once', 'repeating', 'forever')),
  duration_in_months int,
  max_redemptions int,
  times_redeemed int not null default 0,
  redeem_by timestamptz,
  first_time_only boolean not null default false,
  minimum_amount int,
  minimum_amount_currency text,
  -- Empty = applies to every plan.
  applies_to_plan_ids uuid[] not null default '{}',
  active boolean not null default true,
  last_synced_at timestamptz,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists plan_promotions_active_idx on plan_promotions (active, created_at desc);

-- ── plan price migrations ───────────────────────────────────────────────────
-- "Move the N subscribers still on the old price onto the new one", applied at
-- each subscriber's OWN next renewal after a notice period. One target row per
-- subscriber so a partial failure is visible and retryable per user rather than
-- failing a whole batch.
create table if not exists plan_price_migrations (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plans(id) on delete cascade,
  -- null = "every price for this plan except the target".
  from_price_id uuid references plan_prices(id) on delete set null,
  to_price_id uuid not null references plan_prices(id) on delete cascade,
  notice_days int not null default 30,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'done', 'cancelled')),
  total int not null default 0,
  succeeded int not null default 0,
  failed int not null default 0,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists plan_price_migration_targets (
  migration_id uuid not null references plan_price_migrations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'notified', 'scheduled', 'failed', 'skipped')),
  effective_at timestamptz,
  error text,
  updated_at timestamptz not null default now(),
  primary key (migration_id, user_id)
);

-- ── lockdown ────────────────────────────────────────────────────────────────
alter table plans enable row level security;
alter table plan_copy enable row level security;
alter table plan_prices enable row level security;
alter table plan_promotions enable row level security;
alter table plan_price_migrations enable row level security;
alter table plan_price_migration_targets enable row level security;
-- No policies on any of them: reachable only through the service-role client.
revoke all on table plans from anon, authenticated;
revoke all on table plan_copy from anon, authenticated;
revoke all on table plan_prices from anon, authenticated;
revoke all on table plan_promotions from anon, authenticated;
revoke all on table plan_price_migrations from anon, authenticated;
revoke all on table plan_price_migration_targets from anon, authenticated;
