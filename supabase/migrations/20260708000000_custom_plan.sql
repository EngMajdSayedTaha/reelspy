-- Dynamic "build your own plan" support (B4). A subscriptions row can now have
-- tier = 'custom', in which case the actual accounts/scripts/automations/
-- publish_targets/model limits live in this jsonb column instead of the fixed
-- ENTITLEMENTS table (lib/billing/entitlements.ts) — set by the Stripe webhook
-- from the checkout session's metadata (lib/billing/custom-pricing.ts computes
-- it server-side; the client's slider values are never trusted directly).
--
-- Same write posture as the rest of the table: owner-readable, written only by
-- the service-role webhook (see 20260703000003_billing.sql for the base RLS).

alter table subscriptions
  add column if not exists custom_entitlements jsonb;
