-- Instrumentation (L5 / §5). A plain Supabase event log + AI-usage log — no new
-- vendor. Written only by the service-role client via lib/analytics/track.ts;
-- queried with the SQL views below. Forward to PostHog later if dashboards are
-- wanted. RLS is on with NO policies: browser roles can neither read nor write
-- (service-role bypasses RLS), so raw behavioural data never reaches the client.

create table if not exists app_events (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  event text not null,
  props jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists app_events_user_event_idx on app_events (user_id, event, created_at desc);
create index if not exists app_events_event_time_idx on app_events (event, created_at desc);
alter table app_events enable row level security;  -- no policies: service-role only

-- Per-call AI token usage, for tier-margin checks and free-tier abuse detection.
create table if not exists ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  action text not null,                 -- 'script' | 'growth_notes'
  provider text not null,               -- 'nvidia' | 'anthropic'
  model text not null,
  input_tokens int,
  output_tokens int,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_user_time_idx on ai_usage (user_id, created_at desc);
alter table ai_usage enable row level security;  -- no policies: service-role only
