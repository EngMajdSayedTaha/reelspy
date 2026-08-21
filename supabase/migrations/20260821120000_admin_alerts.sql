-- Admin alerts — the operational inbox behind /admin/notifications.
--
-- Every alert the product raises is written here FIRST and emailed second, so
-- the record of "what happened" survives an unconfigured Resend key, a quiet-
-- hours hold, a throttle, or a send that simply failed. The admin UI reads this
-- table; email is one delivery channel over the top of it, not the log itself.
--
-- Preferences (which events alert, to whom, how loudly) live in the
-- `admin_settings`-style key/value row `admin_notifications` in app_settings —
-- see lib/notifications/prefs.ts. Nothing about routing is stored per-row here
-- except the DECISION that was taken, and why.
--
-- Service-role only, like app_settings and jobs: RLS on with no policies, and
-- the anon/authenticated grants revoked. Alerts quote user emails, Stripe
-- amounts and error strings — none of that may ever reach a browser except
-- through the admin API, which gates on requireAdmin().

create table if not exists admin_alerts (
  id uuid primary key default gen_random_uuid(),

  -- Catalog key (lib/notifications/catalog.ts), e.g. 'billing.dispute_opened'.
  -- Deliberately NOT a foreign key or an enum: the catalog is code, it changes
  -- with deploys, and a historical alert for a retired event must still render.
  event text not null,
  category text not null,
  severity text not null check (severity in ('info', 'warning', 'critical')),

  title text not null,
  summary text,
  -- Label/value pairs rendered into the email and the admin row detail.
  context jsonb not null default '{}'::jsonb,
  -- Path (not absolute URL) to the admin screen that acts on this, e.g.
  -- '/admin/waitlist'. Stored relative so it stays correct across domains.
  link text,

  -- ── Repeat folding ───────────────────────────────────────────────────────
  -- Identity of the THING the alert is about ('job:publish_post', 'user:<id>'),
  -- so a storm of the same failure folds into one row with a count instead of
  -- forty rows and forty emails. Null means "every occurrence is distinct".
  dedupe_key text,
  repeat_count int not null default 1,
  last_seen_at timestamptz not null default now(),

  -- ── Delivery ─────────────────────────────────────────────────────────────
  --   pending    raised, waiting for the digest to pick it up
  --   emailed    an email was accepted by the provider
  --   digested   included in a digest that went out
  --   suppressed folded into a recent identical alert (throttle window)
  --   dropped    routing said no (event off, below severity floor, master off)
  --   failed     we tried to email and the provider refused
  delivery text not null default 'pending'
    check (delivery in ('pending', 'emailed', 'digested', 'suppressed', 'dropped', 'failed')),
  -- Machine-ish reason from lib/notifications/routing.ts ('quiet_hours',
  -- 'below_min_severity:warning', 'email_not_configured'), so "why didn't I get
  -- this?" is answerable from the UI months later.
  delivery_reason text,
  emailed_at timestamptz,
  recipients text[] not null default '{}',

  -- ── Inbox state ──────────────────────────────────────────────────────────
  read_at timestamptz,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,

  created_at timestamptz not null default now()
);

-- The feed, newest first — the only ordering the UI ever asks for.
create index if not exists admin_alerts_created_idx on admin_alerts (created_at desc);
-- The throttle lookup: "has this same event fired recently?"
create index if not exists admin_alerts_event_recent_idx on admin_alerts (event, created_at desc);
-- The digest flush: pending rows only, which is a tiny slice of the table.
create index if not exists admin_alerts_pending_idx on admin_alerts (created_at)
  where delivery = 'pending';
-- The unread badge count.
create index if not exists admin_alerts_unread_idx on admin_alerts (created_at desc)
  where read_at is null;

alter table admin_alerts enable row level security;
-- No policies on purpose (app_settings / jobs pattern): service-role only.
revoke all on table admin_alerts from anon, authenticated;
