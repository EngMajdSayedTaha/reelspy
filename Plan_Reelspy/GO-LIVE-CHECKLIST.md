# ReelSpy — Go-Live Checklist (founder actions only)

> **All code is done.** Launch (L1–L13), V1.1 (V1–V7), V2 (X1–X5) are shipped and
> `done` in `ROADMAP.md`. Everything below is **non-code**: things only *you* can do
> (approvals, keys, one migration, manual QA). Nothing here needs another coding session.
>
> The app is built **fail-open**: it runs today without any of these. Each item just
> **unlocks a dormant feature**. Do the 🔴 blockers before charging money; 🟡 items
> light up features; 🟢 is verification.
>
> Last updated: 2026-07-04

---

## 🔴 1. Must-do before charging money

### Stripe (the long pole — start first)
- [ ] Get **Stripe UAE account approved** (longest external wait — apply ASAP)
- [ ] Create the 3 recurring Prices in Stripe → Products (Creator / Pro / Studio)
- [ ] Create webhook endpoint → `https://<domain>/api/stripe/webhook`
      (events: `checkout.session.completed`, `customer.subscription.created/updated/deleted`)
- [ ] Set env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
      `STRIPE_PRICE_CREATOR`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_STUDIO`
- **Until set:** `/dashboard/billing` shows preview mode, checkout/portal/webhook return 503.
- Walkthrough: `docs/billing-setup.md`

### Meta app review (needed for automations + publishing to work for real users)
- [ ] Confirm Meta App review covers **`instagram_content_publish`** +
      **`instagram_manage_messages`** in **production** (Meta App Dashboard — not code).
      Without it, publishing + comment→DM automation only work for app testers.

### Database — one migration still to apply
- [ ] Apply **`supabase/migrations/20260704130000_ig_connections.sql`** (X4 Studio
      multi-account) via Supabase MCP or dashboard.
- **Until applied:** multi-account is dormant; single-connection behaves exactly as today (safe).

### Legal mailboxes (referenced in your live Terms/Privacy copy)
- [ ] Create **`support@reelspy.app`** and **`privacy@reelspy.app`** mailboxes.

---

## 🟡 2. Provision to light up features (safe to run without, but features stay dark)

### Email — Resend (publish-failure alerts + weekly digest)
- [ ] Set `RESEND_API_KEY` + `EMAIL_FROM` (verified sender)
- **Until set:** publish-failure emails and the weekly niche digest silently no-op.

### AI provider keys
- [ ] `ANTHROPIC_API_KEY` — routes paid tiers (Creator→Haiku, Pro/Studio→Sonnet) to Claude.
      Without it, everyone falls back to NVIDIA Llama.
- [ ] `NVIDIA_API_KEY` — free tier engine.
- [ ] `GROQ_API_KEY` **or** `HF_API_TOKEN` — Whisper transcription. Without it,
      transcripts + auto-transcribe are unavailable (reels won't be marked failed — just off).

### Cron infra — Vercel Pro (founder decision #3)
- [ ] Upgrade to **Vercel Pro**, then add the two frequent crons back to `vercel.json`
      (`run-jobs */2`, `poll-comments */10`) and redeploy — one-step, documented.
- **Today (Hobby fallback):** these run from **GitHub Actions** instead — working, just a
  5-min floor. Set the repo secrets so they run:
  - [ ] GitHub repo **secret** `CRON_SECRET` + **variable** `APP_BASE_URL`
        (used by `run-jobs.yml`, `weekly-digest.yml`, `prune-events.yml`, `poll-youtube-comments.yml`)
- Details: `docs/cron-cadence.md`

### TikTok / YouTube publishing (optional platforms — stay private until audited)
- [ ] Pass **TikTok app audit** → then set `TIKTOK_ALLOW_PUBLIC=true`
- [ ] Pass **YouTube API audit** → then set `YOUTUBE_ALLOW_PUBLIC=true`
- **Until then:** posts to these platforms are forced private (UI shows honest notice).
- [ ] *(Dormant, later)* TikTok Research API approval → `TIKTOK_RESEARCH_ENABLED=true`
      (X5 scaffolding; also needs a schema `platform` column — a future coding task, not now).

---

## 🟢 3. Verify before launch (manual QA — ~one focused pass)

- [ ] **Billing E2E (test mode):** checkout → webhook writes `subscriptions` row →
      cap enforced (try account #11 on Creator → friendly block).
- [ ] **Activation SLA:** run a fresh account through onboarding with a stopwatch;
      confirm funnel events land in `app_events` and the SLA view flags <10 min.
- [ ] **Wedge quality:** generate scripts for ~5 reels with ready transcripts on Claude
      vs Llama; confirm the "Grounded on transcript ✓" chip shows.
- [ ] **Publishing failure path:** schedule a post ~10 min out; kill a token mid-flight →
      confirm failure email + Retry button + honest `partial` status render.
- [ ] **PDPL delete/export:** delete a seeded test account → no rows left, R2 prefix empty;
      export returns all tables with **no** token columns.
- [ ] **RTL smoke:** with Arabic locale (`dir="rtl"`), sidebar / feed / generator stay usable.

Full plan: `plan/08-verification-and-unknowns.md`

---

## ⚪ 4. Worth confirming (possible doc drift, not a blocker)

- [ ] **Palette:** `CLAUDE.md` founder decision #1 says the violet rebrand was **reverted —
      keep the app neon-yellow `#f9e400`**, but roadmap **L11** logged violet as applied.
      Confirm which is live in `app/globals.css` and reconcile the note. (Semantic status
      tokens `--success/--warning/--danger/--info` are kept either way.)

---

### Quick status snapshot

| Area | Code | Founder action |
|---|---|---|
| Launch L1–L13 | ✅ done | Stripe keys, Meta review, mailboxes |
| V1.1 V1–V7 | ✅ done | Resend keys, cron secrets |
| V2 X1–X5 | ✅ done | apply `ig_connections` migration |
| Verification | — | manual QA pass (§3) |
