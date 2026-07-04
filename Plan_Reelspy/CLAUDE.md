# ReelSpy — Project Context (read this first, every session)

## What this is
Next.js 16 + Supabase + Vercel app for UAE lead-gen solopreneur creators. The wedge is the
research→script loop (track/score reels → transcripts + hooks → AI scripts). Comment→DM
automation is the retention hook. Publishing is V1.1.

**Goal:** charge money safely for the wedge, target 50–100 paying users at
Free / Creator AED 69 / Pro AED 149 / Studio AED 299 via Stripe UAE, with a <10-minute
signup→first-script activation SLA.

**North Star metric:** Weekly Loop Completions (WLC) — see `plan/05-instrumentation.md`.

## Founder decisions already made (don't re-litigate these)
1. **Palette**: neon-yellow `#f9e400` brand accent on ink/near-black surfaces —
   the violet rebrand was reverted; keep the app yellow. The semantic status
   tokens (`--success`/`--warning`/`--danger`/`--info`) introduced alongside it
   are retained. See `plan/02-launch-blockers.md` → B9.
2. **AI engine**: Claude (Haiku 4.5 default, Sonnet for Pro/Studio) for paid tiers; free
   tier may stay on NVIDIA Llama-3.1-8B. See `plan/03-wedge-quality.md` → W2.
3. **Cron infra**: upgrade to Vercel Pro at launch (5-min publish cadence). Fallback is
   the GitHub Actions pattern already used for YouTube polling. See
   `plan/02-launch-blockers.md` → B5.

These are swappable but treat them as the default unless told otherwise.

## Where everything lives
- `ROADMAP.md` — the single source of truth for phase status. **Always check this before
  starting work and update it before ending a session.**
- `TASKS.md` — the Launch-phase execution checklist in RICE-scored order, one line per
  item, checkable.
- `plan/01-audit.md` — full codebase audit: module grades, what's good (don't touch),
  defects/drift/dead code.
- `plan/02-launch-blockers.md` — B1–B9, the minimum to charge money safely.
- `plan/03-wedge-quality.md` — W1–W6, making research→script feel magical.
- `plan/04-ui-ux.md` — screen-by-screen UI/UX findings, loading states, mobile, a11y, RTL.
- `plan/05-instrumentation.md` — event schema, event map, derived-metric SQL views.
- `plan/06-hardening-debt.md` — H1–H6, job queue, platform abstraction, tests, PDPL.
- `plan/07-future-roadmap.md` — V1.1 and V2 items, explicitly deprioritized items.
- `plan/08-verification-and-unknowns.md` — known unknowns to verify, verification/test plan.

## How to execute (do this, don't freelance a different process)
1. Open `ROADMAP.md`, find the next `[ ]` item in Launch order.
2. Read only the relevant section file for that item — don't reload the whole plan.
3. Use Plan Mode to draft the approach against the actual current code before editing.
4. Use the built-in todo list to track sub-steps within the item.
5. Commit at natural checkpoints, not just at the end.
6. Before ending the session: update `ROADMAP.md` status + `TASKS.md` checkbox, and add
   one or two lines of "what changed / what's left / decisions made" under that item.
7. Start the next item in a fresh session. Don't try to carry it in one long chat.

## Conventions worth knowing
- Rate limiting / quota pattern: atomic RPC (`consume_meta_quota`,
  `consume_user_action`) — reuse this pattern for any new metering (billing, job queue).
- Idempotency pattern: unique-constraint-as-lock (see `automation processor`,
  `dispatchPost`) — reuse for job queue workers.
- Token/secret handling: service-role-only modules, browser-role column grants revoked.
  Never touch this posture without checking `plan/06-hardening-debt.md` → H3 first.
- Semantic color tokens only in new code post-rebrand (B9) — no raw Tailwind palette
  classes.

## Non-negotiables
- Don't add features to `plan/07-future-roadmap.md` items before Launch is done.
- Don't touch things marked "don't touch" in `plan/01-audit.md`.
- Don't widen the schema for a second platform (H2) until that platform is actually built.
