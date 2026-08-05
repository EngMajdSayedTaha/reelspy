-- Release notes (lib/release/): remembers which product version this user has
-- already been shown, so the one-time "What's new" dialog fires once per
-- release per person rather than once per device.
--
-- Nullable with no default on purpose. NULL means "has never acknowledged
-- anything", and lib/release/version.ts resolves that against profiles.created_at
-- so an account created after the latest release starts out caught up instead of
-- being greeted by a popup about features it never lived without.
--
-- No CHECK constraint: an unparseable value degrades to "caught up" app-side
-- (parseVersion returns null), which is the safe direction — a bad row must
-- never spam a user, and must never take a layout render down with it.
--
-- Grants mirror color_theme / tour_completed_at: the owner may read and write
-- their own marker; the token columns stay revoked.

alter table profiles add column if not exists last_seen_version text;

grant select (last_seen_version) on profiles to authenticated;
grant update (last_seen_version) on profiles to authenticated;
