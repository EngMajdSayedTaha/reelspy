-- Multi-tenant brand voice (B2 / L1). Replaces the hardcoded @majdst_codes
-- persona baked into the AI system prompts with per-user niche/audience/offer/
-- tone/language, so generated scripts + growth notes speak in each creator's own
-- voice. Collected during onboarding (B3); until a user fills it in the AI falls
-- back to a neutral creator persona in code (see lib/ai/claude.ts).
--
-- Stored as jsonb (not columns) because it's presentation-only prompt context
-- that will grow with the onboarding form — it is never queried or filtered on.

alter table profiles
  add column if not exists brand_voice jsonb;

-- The browser (authenticated) role may read and write its OWN brand voice: the
-- onboarding form writes it and the AI routes read it, both under the user's
-- RLS-scoped client. This touches no token-column grant, so the SERVER-ONLY
-- posture on ig_access_token / fb_page_access_token is unchanged (see H3).
grant select (brand_voice) on profiles to authenticated;
grant update (brand_voice) on profiles to authenticated;
