-- Permanent fix for the "thumbnails/avatars go blank forever" class of bugs:
-- Instagram's signed CDN URLs expire (~7 days), AND Business Discovery only
-- ever returns each account's most-recent batch of media — once a reel falls
-- out of that window, its URL can never be refreshed again via any API call,
-- so a dead signed URL for it is permanent. The only durable fix is to own a
-- copy of the bytes: this public bucket stores a downloaded copy of every
-- avatar/thumbnail the moment it's fetched, so the URL we serve from our own
-- domain never expires, regardless of what Instagram does with the source
-- media afterward.
insert into storage.buckets (id, name, public)
values ('ig-media', 'ig-media', true)
on conflict (id) do nothing;
