-- Stripe webhook idempotency + event log (payment hardening). Stripe delivers
-- every event AT LEAST once — retries on our 5xx, and occasional duplicate/out-of
-- -order deliveries — so the webhook must dedupe by event id. One row per Stripe
-- `event.id` we have fully processed; the webhook inserts AFTER a handler succeeds
-- and skips any event whose id is already present. Doubles as a lightweight audit
-- trail of what Stripe sent (received_at) vs when we finished (processed_at).
--
-- Same write posture as user_monthly_usage: written ONLY by the service-role
-- webhook, RLS on with no policies, and no anon/authenticated grants — a browser
-- role can never read or forge billing history.

create table if not exists billing_events (
  id text primary key,                       -- Stripe event id (evt_…)
  type text not null,                         -- Stripe event type (e.g. invoice.payment_succeeded)
  received_at timestamptz not null default now(),
  processed_at timestamptz                    -- set once the handler completes; null = crashed mid-handle
);

-- Prune/observe recent activity by time.
create index if not exists billing_events_received_idx
  on billing_events (received_at desc);

alter table billing_events enable row level security;
-- No policies: mutated + read only by the service-role webhook.
revoke all on table billing_events from anon, authenticated;
