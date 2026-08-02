# ReelSpy — Launch Task Checklist

Work top to bottom. Check off in this file AND update the Status column in `ROADMAP.md`
in the same commit. Each checkbox = one Claude Code session/patch.

- [x] **L4** Rate-limit unmetered heavy routes (`reel-from-link`, `diag?transcribe=1`, `publishing/upload`) — see `plan/02-launch-blockers.md` B6
- [x] **L8** Cron cadence → Vercel Pro, `publish-due */5 * * * *`, add `poll-comments */10 * * * *` — see `plan/02-launch-blockers.md` B5
- [x] **L1** De-persona AI prompts — add `brand_voice` jsonb, interpolate into system prompts — see `plan/02-launch-blockers.md` B2
- [x] **L2** Ground scripts on transcripts + hooks, add grounded/caption-only chip — see `plan/03-wedge-quality.md` W1
- [x] **L3** Route paid tiers to Claude (Haiku default, Sonnet Pro/Studio), tool-use forced JSON — see `plan/03-wedge-quality.md` W2
- [x] **L5** `app_events` + `ai_usage` tables, `track()` helper, wire event map, 3 SQL views (WLC, activation funnel, retention) — see `plan/05-instrumentation.md`
- [x] **L6** Stripe UAE billing: `subscriptions` table, `entitlements.ts`, enforcement at 4 chokepoints, checkout/portal/webhook routes, `/dashboard/billing` — see `plan/02-launch-blockers.md` B1 *(code done; awaiting Stripe UAE approval + keys — see docs/billing-setup.md)*
- [x] **L7** Onboarding wizard → <10-min activation, starter-pack path, setup checklist card — see `plan/02-launch-blockers.md` B3
- [x] **L10** Empty/error/loading states across scripts, accounts, generate, publishing, automations — see `plan/02-launch-blockers.md` B7
- [x] **L11** Palette rebrand (`globals.css` tokens, sweep ~52 hardcoded amber/emerald classes) — see `plan/02-launch-blockers.md` B9
- [x] **L9** Publish failure notifications (Resend/Supabase SMTP) + honest `partial` status + retry action — see `plan/02-launch-blockers.md` B4
- [x] **L12** `/terms` page, `/privacy` processor disclosure, account delete + export endpoints — see `plan/02-launch-blockers.md` B8 + `plan/06-hardening-debt.md` H6
- [x] **L13** Vitest setup + entitlements/RPC tests — see `plan/06-hardening-debt.md` H5

---

## Platform Access — P-series (see `09-platform-access.md`)

Getting **strangers** (not just app-role testers) onto Instagram, then TikTok, then YouTube.
Mostly external approvals; the code items are marked. [AGENT] = a Claude session can do it
end to end, [FOUNDER] = a human must click/upload/submit.

**Phase 0 — go live inside Standard access (this week)**
- [ ] **P0.1** [FOUNDER] Invite beta users as Meta app **Testers** + send them the accept-invite steps
- [x] **P0.2** [AGENT] **Code:** `META_BETA_MODE` gate on `/dashboard/connections` + honest provider-error copy (en/ar)
- [x] **P0.3** [AGENT] `npm run check:meta` preflight — exists, run after every domain/env/console change
- [ ] **P0.4** [FOUNDER] Stripe, `ig_connections` migration, mailboxes, API keys — see `GO-LIVE-CHECKLIST.md`

**Phase 1 — Meta Advanced Access without a trade licence**
- [x] **P1.1** [AGENT] **Code:** Meta Deauthorize + Data Deletion callbacks, `fb_user_id` capture, status page, tests
- [ ] **P1.2** [FOUNDER] Point the App Dashboard at the new callback URLs
- [x] **P1.3** [AGENT] Privacy policy names each Meta permission and its purpose
- [x] **P1.4** [AGENT] **Code:** create the reviewer login (`scripts/seed-reviewer-account.mjs`, `meta-reviewer@reelspy.dev`) — credentials handed off
- [ ] **P1.4b** [FOUNDER] Log in as that account and connect a real Instagram Business account you control, then sync + generate one script
- [ ] **P1.5** [FOUNDER] Screencast + submit App Review for the **P0 scope set only**
- [ ] **P1.R** [FOUNDER] Business Verification ladder: unregistered → freelance permit → US LLC (§1b — **decision point, ask the founder**)

**Phase 2 — TikTok** (independent of Meta, no licence needed)
- [ ] **T1** [FOUNDER] Individual developer account + Content Posting API product
- [ ] **T2** [FOUNDER/AGENT] R2 custom domain attached + URL prefix verified in TikTok portal
- [ ] **T4** [AGENT] **Code:** audit `PublishComposer` against TikTok UX guidelines (privacy selector from `creator_info/query`, draft-vs-direct choice, disclosure toggles, music-usage confirmation)
- [ ] **T5** [FOUNDER] Submit the audit → **T6** [AGENT] set `TIKTOK_ALLOW_PUBLIC=true`

**Phase 3 — YouTube/Google** (independent, no licence needed)
- [ ] **Y1** [FOUNDER] Google Cloud project + OAuth consent screen (External, individual)
- [ ] **Y2** [AGENT] Narrow the scope list to `youtube.upload` alone
- [ ] **Y3** [FOUNDER] Verify `reelspy.dev` in Search Console under the project's Google account
- [ ] **Y4/Y5** [FOUNDER] OAuth verification (Gate A) + YouTube compliance audit (Gate B) → **Y6** [AGENT] `YOUTUBE_ALLOW_PUBLIC=true`

---

## Known unknowns to verify before/during Launch (not code work, do in parallel)
- [ ] Confirm Meta app review covers `instagram_content_publish` + `instagram_manage_messages` in production (Meta App Dashboard, not code) — **now tracked as P1.5; submit the P0 scope set first**
- [ ] Confirm Stripe UAE account approval timeline — start application now, it's the long pole outside the code

See `plan/08-verification-and-unknowns.md` for the full verification plan per item.
