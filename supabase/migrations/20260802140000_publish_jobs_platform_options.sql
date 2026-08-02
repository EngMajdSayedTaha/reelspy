-- TikTok's Content Posting API UX guidelines (T4, Plan_Reelspy/09-platform-
-- access.md) require the creator to explicitly choose draft-vs-direct-post
-- and a real privacy level (fetched live per creator, never hardcoded), plus
-- branded/organic-content disclosure toggles. None of that fits the existing
-- `privacy` column (a single "public"/"private" value shared across every
-- platform on a post), so this adds a small per-job options bag.
--
-- Nullable and TikTok-only for now — every other platform's jobs leave it
-- null and the dispatcher/adapters ignore it. Not widening the schema for an
-- unbuilt platform (CLAUDE.md non-negotiable #3): TikTok publishing already
-- ships, this only makes its existing compliance surface correct.

alter table publish_jobs
  add column if not exists platform_options jsonb;

comment on column publish_jobs.platform_options is
  'TikTok-only (for now): {privacyLevel, postMode, brandedContent, brandOrganic} chosen in the compliance panel. Null for every other platform.';
