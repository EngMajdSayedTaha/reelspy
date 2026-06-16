-- Linked / cross-post handles for an inspiration account.
--
-- Instagram's Business Discovery API only returns reels PUBLISHED by the account
-- you query. A "collab" reel (Instagram's invite-a-collaborator feature) is owned
-- by ONE account and merely mirrored onto the collaborators' grids — so a reel a
-- tracked account only co-authored, but that a partner handle published, never
-- appears under the tracked account's media edge and can't be fetched through it.
--
-- linked_usernames lets a user name those partner handles (e.g. a creator's second
-- account). On sync we also fetch each linked handle's reels and merge them into
-- THIS account's feed, so cross-posted/collab reels stop going missing. Additive +
-- idempotent.
alter table inspiration_accounts
  add column if not exists linked_usernames text[] not null default '{}';
