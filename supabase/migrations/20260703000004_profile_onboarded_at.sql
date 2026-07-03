-- Onboarding completion marker (B3 / L7). A single nullable timestamp on
-- profiles: null = onboarding not finished, set = the user completed (or skipped
-- to the end of) the first-run wizard. Individual step progress is INFERRED from
-- real data (ig connection, brand_voice, inspiration_accounts, tracked_reels,
-- generated_scripts) rather than stored — see lib/onboarding/state.ts — so this
-- one column is all the persistent state the wizard needs.
alter table profiles
  add column if not exists onboarded_at timestamptz;

-- The browser (authenticated) role reads it to route first-run users into the
-- wizard and writes it to mark completion, under its own RLS-scoped client. No
-- token-column grant touched (server-only posture on tokens unchanged).
grant select (onboarded_at) on profiles to authenticated;
grant update (onboarded_at) on profiles to authenticated;
