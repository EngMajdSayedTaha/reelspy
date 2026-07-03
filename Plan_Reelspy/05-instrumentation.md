# 05 — Instrumentation

Roadmap: L5. [BLOCKER] — launching without WLC measurement defeats the operating metric.
Effort: 2 evenings (helper + call sites + 3 SQL views).

Constraint-honoring choice: a Supabase `app_events` table + a 20-line server-side helper.
No new vendor; queryable with plain SQL; swap/forward to PostHog later if dashboards are
needed.

## Schema
```sql
create table app_events (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  event text not null,
  props jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index app_events_user_event_idx on app_events (user_id, event, created_at desc);
create index app_events_event_time_idx on app_events (event, created_at desc);
alter table app_events enable row level security;  -- no policies: service-role only

create table ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  action text not null,             -- 'script' | 'growth_notes'
  provider text not null, model text not null,
  input_tokens int, output_tokens int,
  created_at timestamptz not null default now()
);
```

`lib/analytics/track.ts`: `track(admin, userId, event, props)` — fire-and-forget insert,
never throws into the request path.

## Event map (where each fires)

| Event | Fires in |
|---|---|
| `signed_up` | `app/auth/callback/route.ts` (first-session detection via `profiles.created_at`) |
| `ig_connected` | `app/api/ig/callback/route.ts` success path |
| `onboarding_step` {step} | new onboarding actions (B3) |
| `account_added` {bulk, count} | `accounts/actions.ts:83,180` |
| `feed_synced` {inserted, updated, rateLimited} | `app/api/ig/sync/route.ts:229` |
| `transcript_ready` {source, lang, ms} | `transcript/route.ts:215` and reel-from-link |
| `hook_saved` | W4 action |
| `script_generated` {grounded_on, provider, degraded, reel_id?} | `generate-script/route.ts:92` (also write `ai_usage` — `chat()` must return the response `usage` object both providers already send and currently discard, `provider.ts:146,234`) |
| `script_scheduled` | `scripts/actions.ts` scheduleScript |
| `post_created` / `publish_job_finished` {platform, status, attempt} | `publishing/actions.ts`, `dispatcher.ts:196-218` |
| `automation_fired` {type, reply_status, dm_status} | `processor.ts:164`, dm/yt processors |
| `subscription_changed` {tier, status} | Stripe webhook (B1) |

## Derived metrics (SQL views, no extra code)
- **WLC (North Star)**: distinct users with a `script_generated` (or
  `publish_job_finished` success) within 7 days *after* a research event
  (`feed_synced`/`transcript_ready`) — weekly buckets.
- **Activation funnel + SLA**: `signed_up → ig_connected → account_added → feed_synced →
  script_generated`, with `min(script_generated.created_at) - signed_up.created_at < 10 min`
  as the SLA flag per user.
- **Retention cohorts**: signup-week × active-week matrix on any event.
- **Publish success rate**: `publish_job_finished` status ratio by platform/week.
- **Per-user AI cost**: `ai_usage` tokens × model price map — feeds tier margin checks and
  the free-tier abuse view.
