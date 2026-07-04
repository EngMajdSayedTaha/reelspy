-- V3 (W6): weekly niche digest email. An opt-out flag so the digest respects
-- unsubscribe (one-click link + a Settings toggle). Default false = opted in.
-- Grants mirror brand_voice/onboarded_at (readable + self-updatable by the owner;
-- the token columns stay revoked).

alter table profiles add column if not exists digest_opt_out boolean not null default false;

grant select (digest_opt_out) on profiles to authenticated;
grant update (digest_opt_out) on profiles to authenticated;
