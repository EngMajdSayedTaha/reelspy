# 01 — Codebase Audit

Overall: this is a genuinely well-engineered codebase for a solo founder — atomic
Postgres-backed rate limiting, a shared snapshot dedup cache, column-level token lockdown,
idempotent automation/publishing pipelines, careful error copy. The gaps are product-level
(billing, onboarding, instrumentation, multi-tenant AI), not architectural.

## Module grades

| Module | Grade | Evidence |
|---|---|---|
| Inspiration tracking & scoring | **launch-ready** (scoring formula needs-hardening) | `app/dashboard/feed/page.tsx`, `lib/instagram/snapshots.ts`, `supabase/schema.sql:129-133` |
| Transcripts | **needs-hardening** | `lib/media/ytdlp.ts`, `lib/transcription/*`, `app/api/reels/[reel_id]/transcript/route.ts` |
| Hooks library | **incomplete** | `app/dashboard/hooks/page.tsx`, `lib/utils/hook.ts`, hidden from nav at `components/layout/Sidebar.tsx:32-33` |
| Script generation | **incomplete** (single-tenant persona; weak grounding) | `lib/ai/claude.ts:11`, `app/api/generate-script/route.ts:55-70` |
| Automations (IG comment→DM, IG DM, YouTube) | **launch-ready** mechanics / **needs-hardening** ops | `lib/auto-reply/processor.ts`, `app/api/ig/webhooks/route.ts` |
| Publishing | **incomplete** for GA (fine as V1.1 beta) | `lib/publishing/dispatcher.ts`, `vercel.json:5` |
| Insights / growth notes | **needs-hardening** | `app/api/growth-notes/route.ts`, `lib/ai/claude.ts:24` |
| Auth / RLS / security | **launch-ready** with 3 specific gaps (below) | `middleware.ts`, `supabase/schema.sql:39-45,364-370`, `lib/utils/cron.ts` |
| Billing / entitlements | **missing** — zero Stripe/tier code exists (grep-verified) | — |
| Onboarding | **missing** — dashboard home is stat cards only (`app/dashboard/page.tsx`) | — |
| Instrumentation | **missing** — no analytics events anywhere | — |

## What's genuinely good (don't touch)

- **Snapshot dedup cache** (`lib/instagram/snapshots.ts`): each public account fetched from
  Meta once per 6h TTL, shared across all users; per-user feeds materialized with pure DB
  work. This *is* the dataset moat's foundation — it already accumulates
  `ig_reel_snapshots` history across users.
- **Meta rate limiter** (`lib/instagram/rate-limit.ts` + `consume_meta_quota` RPC,
  `schema.sql:547-639`): atomic token bucket + per-user cap + circuit breaker fed by
  Meta's `X-App-Usage` headers. Correct and shared across serverless invocations.
- **Automation idempotency** (`lib/auto-reply/processor.ts:107-121`): unique
  `comment_id` insert *is* the lock; webhook + polling can overlap safely. Echo-loop
  guarded twice (`processor.ts:76,88`). Webhook HMAC is timing-safe
  (`app/api/ig/webhooks/route.ts:51-57`).
- **Token security posture**: IG/FB/social tokens are revoked from browser Postgres roles
  via column grants (`schema.sql:39-45, 364-370`); all token IO flows through
  service-role-only modules (`lib/instagram/token-store.ts`, `lib/publishing/token-store.ts`).
- **SSRF discipline**: user-supplied URLs to yt-dlp are parsed, https-only,
  host-pinned to instagram.com (`app/api/ig/reel-from-link/route.ts:22-39`,
  `app/api/reels/diag/route.ts:15-24`).

## Defects, drift, dead code, risky patterns

1. **Hardcoded single-user persona in every AI prompt** — `lib/ai/claude.ts:11` and `:24`
   bake `@majdst_codes — a senior full-stack developer from the UAE` into the script and
   growth-notes system prompts. Every customer today gets scripts written for the founder's
   account. *This is the #1 product defect.* → fixed by L1 / B2.
2. **Scripts ground on caption only** — `app/api/generate-script/route.ts:55-70` fetches
   `id, caption` from the reel and ignores `transcript` even when
   `transcript_status='ready'`. The transcript pipeline's output never reaches the model;
   the generate page (`app/dashboard/generate/[reel_id]/page.tsx:68-77`) shows the
   transcript beside a generator that doesn't use it. → fixed by L2 / W1.
3. **Scheduled publishing is up to 24h late** — `vercel.json:5` runs `publish-due` at
   `0 0 * * *` (Hobby-plan daily limit). The YouTube poll already works around this via
   GitHub Actions (`.github/workflows/poll-youtube-comments.yml`). → fixed by L8 / B5.
4. **Publish failures are silent** — `lib/publishing/dispatcher.ts:207-218` writes
   `error_message` to `publish_jobs` and moves on; no email/notification, and a post with
   1 success + 3 failures is marked `done` (`dispatcher.ts:224`), hiding partial failure.
   → fixed by L9 / B4.
5. **Rate-limiter coverage gap** — only 3 routes call `consumeUserAction`
   (`generate-script`, `growth-notes`, `transcript`). `POST /api/ig/reel-from-link`
   (`route.ts:41-108`) runs the full yt-dlp+Whisper pipeline (maxDuration 300) with **no
   throttle**; `GET /api/reels/diag?transcribe=1` likewise (auth-gated but unmetered);
   `POST /api/publishing/upload` mints unlimited presigned PUTs (R2 object spam).
   → fixed by L4 / B6.
6. **Viral score is absolute, not relative** — `schema.sql:129-133`:
   `likes×1 + comments×3 + views×0.01` as a stored generated column. A 2M-follower account
   drowns out a rising 8K niche account; weights are frozen in DDL (migration
   `20260626_score_nullsafe_and_indexes.sql` had to rebuild the column to change them).
   Rising-Now velocity (`feed/page.tsx:44-57`) partially compensates. → V1.1 / W3.
7. **Hook library is ephemeral and hidden** — hooks are re-derived per pageload from the
   transcript's first line (`lib/utils/hook.ts:3-23`); no persistence, no save/tag; nav
   entry commented out (`Sidebar.tsx:32-33`). The wedge's middle step is a ghost feature.
   → V1.1 / W4.
8. **Dead code / drift**:
   - `getReelInfo()` (`lib/media/ytdlp.ts:160-202`) — exported, never imported.
   - Migration churn pairs: `20260607_reel_patterns` → dropped `20260616`;
     `20260614_auto_reply_like` → dropped `20260625b`. History noise only —
     `schema.sql` (regenerated 2026-06-29) is the authoritative snapshot and matches.
   - Two parallel "calendar" concepts: `generated_scripts.scheduled_date` (planning) vs
     `publish_posts.scheduled_at` (real posts), merged visually in
     `app/dashboard/calendar/page.tsx:31-49`. Works, but duplicated scheduling semantics.
   - `/dashboard/hooks` and `/api/cron/poll-comments` are intentionally dormant (the
     latter documented as a fallback, `poll-comments/route.ts:8-14`).
9. **yt-dlp scraping risk** — transcription depends on scraping IG CDN URLs with an
   optional session cookie (`YTDLP_COOKIES_B64`, `lib/media/ytdlp.ts:79-86`). This is
   fragile (IG blocks), a Meta ToS gray zone, and the cookie is a real account's session.
   Accept for launch; isolate behind the transcription interface (already done) and
   document rotation. Do not build more features that assume it always works.
10. **AI JSON parsing is a workaround pyramid** — curly-quote repair, control-char
    escaping, fence stripping, truncation salvage (`lib/ai/claude.ts:57-136,310-355`) all
    exist to compensate for Llama-8B. Moving paid tiers to Claude with tool-use JSON
    deletes most of this. → L3 / W2.
11. **Minor**: `profiles` grants allow `update (id, ...)` (`schema.sql:45`) — RLS
    `with check` prevents abuse but granting id update is unnecessary; only `/dashboard`
    and `/dashboard/feed` have `loading.tsx` skeletons (other 8 routes hard-block);
    `no /terms page` exists at all (only `/privacy`, `/cookies`).

## Founder decisions this audit made (swappable, see CLAUDE.md)
A clarifying question to the founder failed to deliver mid-session, so the plan proceeds
on the recommended option for each:
1. **Palette** — code ships neon-yellow `#f9e400`, not the brief's ink/violet/emerald →
   rebrand at launch (cheap now, expensive after marketing assets exist).
2. **AI engine** — wedge runs on free NVIDIA Llama-3.1-8B by default, Claude only as
   fallback → Claude for paid tiers, free tier may stay on Llama.
3. **Cron infra** — Vercel Hobby limits crons to daily → upgrade to Vercel Pro at launch.
