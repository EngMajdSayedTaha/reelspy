# 06 — Hardening & Debt

## H1. Durable job queue (before automation volume grows) — 3 evenings [MOAT-adjacent] · Roadmap: V4
Path of least resistance on this stack: a `jobs` table worked by a minutely Vercel cron —
**not** an external queue.
```sql
create table jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null,               -- 'publish_post' | 'transcribe_reel' | 'send_digest'
  payload jsonb not null,
  run_at timestamptz not null default now(),
  attempts int not null default 0, max_attempts int not null default 5,
  locked_at timestamptz, locked_by text,
  status text not null default 'queued',  -- queued|running|done|failed
  last_error text, created_at timestamptz default now()
);
```
Worker claims with `update … where id in (select … for update skip locked)` — the same
atomic-RPC discipline as `consume_meta_quota`. Migration order: (1) publish dispatch moves
from inline cron loop to jobs (per-post job; `dispatchPost` unchanged — it's already
idempotent); (2) auto-transcribe (W5) becomes `transcribe_reel` jobs; (3) digest emails.
Webhook comment processing **stays** on `after()` — it's latency-sensitive and already
idempotent; add a `poll-comments` cron as the retry net (B5).

## H2. Platform abstraction layer — 2 evenings · Roadmap: X5 (V2)
Half exists: publishing already has `PlatformAdapter` (`lib/publishing/types.ts`,
4 adapters + dispatcher). Complete the pattern on the research side: extract a
`ResearchSource` interface (`getProfile`, `getRecentReels`) implemented by the current
Business Discovery code in `lib/instagram/graph-api.ts`, consumed by `snapshots.ts`. Keys
(`ig_username`) stay; add a `platform` discriminator column to
`inspiration_accounts`/snapshots **only when** a second source is actually built (TikTok
research, V2) — don't pre-widen the schema. Same for auto-reply: `graph-calls.ts` /
`youtube-calls.ts` already parallel each other; a common `ReplyChannel` interface is a
1-evening refactor when the third channel appears.

## H3. Token/secret handling review — 0.5 evening
Current posture is good (column revokes, service-role-only modules). Actions: drop the
unnecessary `update (id)` grant (`schema.sql:45`); document `YTDLP_COOKIES_B64` as a
real-session credential with rotation notes; consider Supabase Vault for token columns
post-launch (not a blocker — browser roles can't read them); verify Stripe webhook secret
handling mirrors `cronAuthorized`'s timing-safe compare.

## H4. Rate-limiter coverage
Covered by B6 (Roadmap L4); plus add per-tier multipliers to
`USER_ACTION_LIMITS` (`lib/utils/user-rate-limit.ts:16-29`) once entitlements exist, so
limits become the metering layer for billing.

## H5. Test strategy (what deserves tests now) — Roadmap: L13
Add vitest (0.5 evening setup). Worth testing — pure logic with real failure cost:
- `matchKeyword` (`lib/auto-reply/keyword-match.ts`) — Arabic/emoji boundaries, the file
  literally says "unit-testable".
- JSON repair/salvage (`lib/ai/claude.ts:57-136,310-355`) — regression-prone.
- `extractHook`, `rankRising`, `parseUsageHeaders` (`rate-limit.ts:72-108`).
- **Entitlements** (new, B1) — the money logic.
- RPC behavior (`consume_user_action`, `consume_meta_quota`) via one integration test
  against local Supabase.
Explicitly **not** worth it now: page components, adapters against live APIs (use the
diag routes + manual smoke), snapshots/E2E. ~2 evenings total including B1's tests.

## H6. PDPL items that touch code — 2 evenings [pulled into launch, Roadmap L12]
- `POST /api/account/delete`: re-auth confirm → revoke Meta token (Graph
  `DELETE /me/permissions`), delete R2 objects under `{user_id}/`
  (`deleteR2Object`, `lib/storage/r2.ts:112`), `auth.admin.deleteUser()` — profile
  cascade wipes all rows (every user table is `on delete cascade` from profiles,
  verified in `schema.sql`).
- `GET /api/account/export`: JSON bundle of the user's rows (profiles sans tokens,
  accounts, reels, scripts, automations, events) — rate-limited via
  `consumeUserAction`.
- Privacy page: processor list, breach-notification commitment, PDPL data-subject
  contact (page copy, 0 code).
- Data minimization note: `automation_events.comment_text` already capped at 500 chars
  (`processor.ts:113`) — good; add a retention cron truncating event rows >12 months (V1.1, see V7).
