# 02 — Launch Blockers (minimum to charge money safely)

Estimates in founder-evenings (~3 focused hours). Total: **~20 evenings ≈ 6–8 weeks at
10–15 h/wk.** (Roadmap total is ~23 ev including test/legal items pulled in — see
`ROADMAP.md`.)

## B1. Stripe UAE billing + entitlements — 7 evenings [BLOCKER] · Roadmap: L6
- New tables: `subscriptions` (user_id, stripe_customer_id, stripe_subscription_id, tier,
  status, current_period_end) + `entitlements` derived in code, not DB.
- `lib/billing/entitlements.ts` — single source of truth:
  `{ free: {accounts:3, scripts_mo:10, automations:0, publish_targets:0}, creator: {10, 60, 3, 1}, pro: {25, 200, 10, 4}, studio: {50, unlimited, 30, 4} }`
  (exact numbers = founder call; structure is what matters).
- Enforcement points (all already have natural chokepoints):
  - tracked accounts → `addInspirationAccount` / `bulkAddInspirationAccounts`
    (`app/dashboard/accounts/actions.ts:12,116`) — count check before insert.
  - scripts/month → extend the existing `consume_user_action` RPC pattern
    (`schema.sql:465-509`) with a monthly window, called in
    `app/api/generate-script/route.ts:34` alongside the hourly throttle.
  - automations → count check in `app/dashboard/automations/actions.ts` create paths.
  - transcripts/month → same RPC pattern in the transcript + reel-from-link routes.
- Routes: `POST /api/billing/checkout` (Stripe Checkout session),
  `POST /api/billing/portal`, `POST /api/stripe/webhook` (signature-verified, updates
  `subscriptions`). New `/dashboard/billing` page + tier badge in Sidebar.
- Reuse: `cronAuthorized`-style timing-safe verification pattern; zod body validation
  pattern from `generate-script/route.ts:14-20`.

## B2. De-persona the AI prompts (multi-tenant brand voice) — 2 evenings [BLOCKER][WEDGE] · Roadmap: L1
- Add `brand_voice` jsonb to `profiles` (niche, audience, offer, tone notes, language).
- Collected during onboarding (B3); interpolated into `SCRIPT_SYSTEM_PROMPT` and
  `GROWTH_SYSTEM_PROMPT` (`lib/ai/claude.ts:11,24`) replacing the hardcoded persona.
- Without this, charging anyone but the founder is indefensible.

## B3. Onboarding flow to <10-min activation — 3 evenings [BLOCKER][WEDGE] · Roadmap: L7
- First-run wizard (state = simple `profiles.onboarded_at` + step inference from data):
  1. Connect Instagram (existing `/api/ig/connect` flow) — with a "skip, use starter
     pack" branch since Business Discovery *requires* a connected IG Business account
     (`accounts/actions.ts:61-65` hard-blocks otherwise; the starter pack seeds from
     `ig_account_snapshots` rows that already exist globally — zero Meta quota).
  2. Brand-voice mini-form (feeds B2).
  3. Add 3–5 accounts (suggest UAE lead-gen niches; reuse `bulkAddInspirationAccounts`).
  4. Auto-trigger sync (`/api/ig/sync`) + auto-transcribe the top-scored reel, then land
     on `/dashboard/generate/[reel_id]` with one tap to first script.
- Dashboard home gets a persistent "setup checklist" card until activation completes.
- This is also where activation instrumentation (`04-instrumentation.md`... see
  `05-instrumentation.md`) fires.

## B4. Publish-job failure notifications — 2 evenings [BLOCKER] · Roadmap: L9
- Add Resend (or Supabase SMTP) `lib/email/send.ts`.
- In `dispatchPost` (`lib/publishing/dispatcher.ts:221-227`): when any job fails, set post
  status `partial`/`failed` honestly (new status value) and send one summary email with
  per-platform error + deep link; in-app: failed-job banner + "Retry" action on
  `/dashboard/publishing` that flips failed jobs back to `pending` (dispatcher is already
  idempotent on pending — retry is free).

## B5. Cron cadence — 0.5 evening [BLOCKER] · Roadmap: L8
- Vercel Pro; change `vercel.json` to `publish-due */5 * * * *`, add
  `poll-comments */10 * * * *` (webhook fallback), keep snapshot/token crons daily.
  (Fallback if Pro is rejected: clone the GH Actions pattern from
  `.github/workflows/poll-youtube-comments.yml`.)

## B6. Rate-limit the unmetered heavy routes — 0.5 evening [BLOCKER] · Roadmap: L4
- Add `consumeUserAction(supabase, user.id, "transcript")` to
  `app/api/ig/reel-from-link/route.ts` (it's the same pipeline); add a cheap
  `upload_presign` action limit to `app/api/publishing/upload/route.ts`; gate
  `/api/reels/diag?transcribe=1` behind an env allowlist or admin check.

## B7. Error/empty-state pass on wedge screens — 1.5 evenings [BLOCKER] · Roadmap: L10
- Feed already handles filtered-empty (`ReelFeed` receives `hasFilters`); add: zero-account
  first-run state routing to onboarding; sync-failed inline retry; `loading.tsx` for
  `scripts`, `accounts`, `generate/[reel_id]`, `publishing`, `automations` (skeleton
  component exists: `components/ui/skeleton.tsx`); scripts page empty state; generate page
  when transcript failed (currently the panel shows failure but generator gives no hint
  that grounding is degraded).

## B8. Legal minimum to charge — 2 evenings [BLOCKER] · Roadmap: L12
- `/terms` page (does not exist) with refund policy; update `/privacy` with processor
  disclosure (Supabase, Vercel, Stripe, Anthropic/NVIDIA, Groq/HF, Cloudflare R2, Meta)
  and PDPL contact; wire the existing deletion promise (`app/privacy/page.tsx:70-83`) to a
  real endpoint — see `06-hardening-debt.md` H6, which is pulled into launch scope.

## B9. Palette rebrand — 1 evening [BLOCKER-adjacent, do with B7] · Roadmap: L11
- Token swap in `app/globals.css:12-63`: `--primary/--accent/--ring` → violet `#6D28D9`,
  success accents → emerald `#10B981`, dark surfaces → ink `#0F172A` family. Sweep the
  ~40 hardcoded `emerald-/amber-/rose-` classes (audit found 52×amber-500, 21×emerald-500,
  etc.) into semantic tokens (`--success`, `--warning`, `--danger`); fix the yellow sheen
  rgba at `globals.css:260`.
