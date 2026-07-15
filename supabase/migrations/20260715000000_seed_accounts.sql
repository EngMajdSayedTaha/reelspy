-- Cold-start seed pool for niche suggestions.
--
-- Why: the suggested-accounts engine (lib/suggestions/accounts.ts) ranks accounts
-- OTHER users have filed into niche-named account_groups (the cross-user "moat",
-- lib/trends/niche.ts). That pool is necessarily empty on a young/single-user
-- deployment, so a fresh creator gets no niche suggestions. This table is a
-- curated per-niche pool of real IG handles used ONLY as a cold-start fallback —
-- it is intentionally kept OUT of the cross-user aggregate (nicheTrending /
-- listNiches) so it never pollutes the real trend intelligence.
--
-- Records only intent (this handle belongs to this niche). Enrichment status and
-- metrics (followers, reels) live in the existing ig_account_snapshots /
-- ig_reel_snapshots cache, keyed by ig_username. A handle that fails Business
-- Discovery validation simply never gets reel snapshots and so never surfaces.

create table if not exists seed_accounts (
  ig_username text primary key,        -- normalized: lowercased, no leading @
  niche_slug  text not null,           -- slugifyNiche() form, e.g. "real estate"
  priority    int  not null default 0, -- optional manual ranking within a niche
  added_at    timestamptz default now()
);

create index if not exists seed_accounts_niche_idx on seed_accounts (niche_slug);

-- Internal seed data: only the service role (seed script + enrich cron + the
-- server-side suggestion engine) touches it. RLS on with NO policies = no access
-- for anon/authenticated clients, matching ig_account_snapshots (migration
-- 20260610000001).
alter table seed_accounts enable row level security;
