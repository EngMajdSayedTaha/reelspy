-- Onboarding quiz + product tour markers, and the resolved niche taxonomy key
-- (X4). `quiz_completed_at`/`tour_completed_at` are "done OR dismissed" markers
-- — same one-shot pattern as onboarded_at (20260703000004) — so each UI element
-- shows exactly once per user across devices. `niche_slug` caches the result of
-- mapping the user's free-text brand_voice.niche onto the Niche Radar taxonomy
-- (lib/trends/niche.ts) so the AI/string matching in lib/suggestions/accounts.ts
-- runs once per niche edit rather than on every page load.
alter table profiles
  add column if not exists quiz_completed_at timestamptz,
  add column if not exists tour_completed_at timestamptz,
  add column if not exists niche_slug text;

grant select (quiz_completed_at, tour_completed_at, niche_slug) on profiles to authenticated;
grant update (quiz_completed_at, tour_completed_at, niche_slug) on profiles to authenticated;
