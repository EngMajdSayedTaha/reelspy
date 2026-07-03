-- DM keyword automations: auto-reply to incoming DIRECT MESSAGES that match
-- keywords (companion to reel_automations, which handles reel comments).
--
-- Story replies are deliberately NOT handled — incoming messages that are
-- replies to a story are skipped by the processor and never logged.

create table if not exists dm_automations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  keywords text[] not null,
  match_mode text not null default 'contains' check (match_mode in ('contains', 'exact', 'any')),
  reply_message text not null,
  reply_link text,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table dm_automations enable row level security;

create policy "Users can manage own dm automations"
  on dm_automations for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- One row per ACTIONED message; message_id (Meta's mid) UNIQUE = idempotency
-- lock, exactly like automation_events.comment_id. Service role writes,
-- owner reads.

create table if not exists dm_automation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  automation_id uuid references dm_automations(id) on delete set null,
  message_id text not null unique,
  sender_id text,
  sender_username text,
  message_text text,
  matched_keyword text,
  reply_status text not null default 'pending',  -- pending | sent | failed | skipped
  reply_error text,
  created_at timestamptz default now(),
  processed_at timestamptz
);

alter table dm_automation_events enable row level security;

create policy "Users can read own dm automation events"
  on dm_automation_events for select
  using (auth.uid() = user_id);

create index if not exists dm_automation_events_user_created_idx
  on dm_automation_events (user_id, created_at desc);

-- Per-sender cooldown lookup for 'any'-mode automations.
create index if not exists dm_automation_events_sender_idx
  on dm_automation_events (user_id, sender_id, created_at desc);
