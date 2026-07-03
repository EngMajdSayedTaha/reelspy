-- Per-platform captions for the Publishing module.
--
-- publish_posts.caption stays the shared/default caption. Each publish_jobs row
-- (one per platform target) may now carry its own caption override: when set, the
-- dispatcher posts it instead of the shared one; when null, it falls back to the
-- post-level caption. This lets a single upload go out with tailored copy per
-- platform (e.g. a hashtag-heavy Instagram caption vs. a short TikTok line).

alter table publish_jobs
  add column if not exists caption text;
