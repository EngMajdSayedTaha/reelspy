-- Preset color theme preference (Settings → Appearance). The account is the
-- cross-device source of truth; a plain cookie mirrors it for zero-flash SSR
-- (see lib/color-theme.ts). No CHECK constraint — unknown values degrade to
-- the default app-side via normalizeColorTheme. Grants mirror digest_opt_out
-- (readable + self-updatable by the owner; token columns stay revoked).

alter table profiles add column if not exists color_theme text not null default 'volt';

grant select (color_theme) on profiles to authenticated;
grant update (color_theme) on profiles to authenticated;
