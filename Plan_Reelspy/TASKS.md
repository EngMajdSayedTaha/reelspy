# ReelSpy — Launch Task Checklist

Work top to bottom. Check off in this file AND update the Status column in `ROADMAP.md`
in the same commit. Each checkbox = one Claude Code session/patch.

- [ ] **L4** Rate-limit unmetered heavy routes (`reel-from-link`, `diag?transcribe=1`, `publishing/upload`) — see `plan/02-launch-blockers.md` B6
- [ ] **L8** Cron cadence → Vercel Pro, `publish-due */5 * * * *`, add `poll-comments */10 * * * *` — see `plan/02-launch-blockers.md` B5
- [ ] **L1** De-persona AI prompts — add `brand_voice` jsonb, interpolate into system prompts — see `plan/02-launch-blockers.md` B2
- [ ] **L2** Ground scripts on transcripts + hooks, add grounded/caption-only chip — see `plan/03-wedge-quality.md` W1
- [ ] **L3** Route paid tiers to Claude (Haiku default, Sonnet Pro/Studio), tool-use forced JSON — see `plan/03-wedge-quality.md` W2
- [ ] **L5** `app_events` + `ai_usage` tables, `track()` helper, wire event map, 3 SQL views (WLC, activation funnel, retention) — see `plan/05-instrumentation.md`
- [ ] **L6** Stripe UAE billing: `subscriptions` table, `entitlements.ts`, enforcement at 4 chokepoints, checkout/portal/webhook routes, `/dashboard/billing` — see `plan/02-launch-blockers.md` B1 *(start Stripe UAE application in week 1 — long pole)*
- [ ] **L7** Onboarding wizard → <10-min activation, starter-pack path, setup checklist card — see `plan/02-launch-blockers.md` B3
- [ ] **L10** Empty/error/loading states across scripts, accounts, generate, publishing, automations — see `plan/02-launch-blockers.md` B7
- [ ] **L11** Palette rebrand (`globals.css` tokens, sweep ~52 hardcoded amber/emerald classes) — see `plan/02-launch-blockers.md` B9
- [ ] **L9** Publish failure notifications (Resend/Supabase SMTP) + honest `partial` status + retry action — see `plan/02-launch-blockers.md` B4
- [ ] **L12** `/terms` page, `/privacy` processor disclosure, account delete + export endpoints — see `plan/02-launch-blockers.md` B8 + `plan/06-hardening-debt.md` H6
- [ ] **L13** Vitest setup + entitlements/RPC tests — see `plan/06-hardening-debt.md` H5

---

## Known unknowns to verify before/during Launch (not code work, do in parallel)
- [ ] Confirm Meta app review covers `instagram_content_publish` + `instagram_manage_messages` in production (Meta App Dashboard, not code)
- [ ] Confirm Stripe UAE account approval timeline — start application now, it's the long pole outside the code

See `plan/08-verification-and-unknowns.md` for the full verification plan per item.
