-- Search indexes for the admin user directory. The admin Users list searches
-- profiles by username with a trigram ILIKE, so add pg_trgm + a GIN trigram
-- index; plus a plain created_at index for the default "newest signups" sort.
-- (subscriptions.stripe_customer_id is already indexed — see the billing
-- migration.)
create extension if not exists pg_trgm;

create index if not exists profiles_username_trgm_idx
  on profiles using gin (username gin_trgm_ops);

create index if not exists profiles_created_at_idx
  on profiles (created_at desc);
