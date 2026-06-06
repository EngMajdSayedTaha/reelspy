-- Account groups: organize inspiration accounts into named groups (e.g.
-- "Angular", "Memes") and filter the feed by group. Additive + idempotent.

create table if not exists account_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  name text not null,
  created_at timestamptz default now(),
  unique(user_id, name)
);

alter table account_groups enable row level security;

do $$ begin
  create policy "Users can manage own groups"
    on account_groups for all using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

alter table inspiration_accounts
  add column if not exists group_id uuid references account_groups(id) on delete set null;
