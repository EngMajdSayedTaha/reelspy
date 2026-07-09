-- Bug: connecting your own Instagram account (app/api/ig/callback/route.ts)
-- used to also upsert a row for it into inspiration_accounts — the same
-- table used for tracked/competitor accounts. That made your own account
-- show up on the Accounts page, pulled your own reels into the Feed, and
-- counted against the plan's tracked-account limit (free plan seeded with
-- 3 accounts during onboarding + your own synced account = 4/3).
--
-- The callback no longer does this insert. This migration removes rows
-- already created that way for existing users: any inspiration_accounts
-- row whose ig_username exactly matches that same user's own connected IG
-- username. Matched against profiles.username (set by storeIgToken on every
-- connect) rather than ig_connections, since that table's migration
-- (20260704130000_ig_connections.sql) has not yet been applied here.
-- tracked_reels for those rows cascade-deletes via its account_id foreign
-- key (on delete cascade), so no orphaned reels are left behind.
delete from inspiration_accounts ia
using profiles p
where ia.user_id = p.id
  and p.username is not null
  and ia.ig_username = p.username;
