# ReelSpy — Roadmap & Status

Update this file at the end of every session. Status values: `todo` · `in-progress` · `blocked` · `done`.

## LAUNCH (blockers only — ~23 evenings ≈ 7–8 weeks at 10–15 h/wk)

Execution order: L4/L8 → L1 → L2 → L3 → L5 → L6 → L7 → L10/L11 → L9 → L12 → L13.
(L6 before L7 so onboarding can show tiers.)

| # | Item | Tag | Effort | Status | Notes |
|---|---|---|---|---|---|
| L4 | Rate-limit the unmetered heavy routes (B6) | BLOCKER | 0.5 ev | done | throttled reel-from-link (shares `transcript` bucket) + new `upload_presign` limit; diag `?transcribe=1` gated behind `DIAG_ALLOWED_USER_IDS` (fail-closed) |
| L8 | Cron cadence / Vercel Pro (B5) | BLOCKER | 0.5 ev | done | `publish-due` → `*/5`, added `poll-comments */10`; needs Vercel Pro live |
| L1 | De-persona AI prompts (B2) | BLOCKER, WEDGE | 2 ev | done | `brand_voice` jsonb on profiles; system prompts now built from it with neutral fallback; both AI routes pass it. Collection UI lands in L7 |
| L2 | Transcript-grounded scripts (W1) | WEDGE | 2 ev | done | route feeds `<reel_transcript>` + perf stats into the prompt; `grounded` flag → chip in ScriptGenerator; one-tap "transcribe first, then regenerate" |
| L3 | Claude for paid tiers + tool-use JSON (W2) | WEDGE | 2 ev | todo | |
| L5 | Instrumentation + WLC views (§5) | BLOCKER | 2 ev | todo | needed to measure everything after |
| L6 | Stripe UAE billing + entitlements (B1) | BLOCKER | 7 ev | todo | biggest single item; start Stripe UAE application in week 1 |
| L7 | Onboarding to <10-min activation (B3) | BLOCKER, WEDGE | 3 ev | todo | do after L6 |
| L10 | Empty/error/loading states (B7) | BLOCKER | 1.5 ev | todo | |
| L11 | Palette rebrand + token hygiene (B9) | BLOCKER-adj | 1 ev | todo | do with L10 |
| L9 | Publish failure notifications + retry (B4) | BLOCKER | 2 ev | todo | |
| L12 | Terms page + privacy update + delete/export (B8+H6) | BLOCKER | 4 ev | todo | |
| L13 | Vitest + money-logic tests (H5, entitlements slice) | BLOCKER-adj | 1.5 ev | todo | |

**Launch total:** ~23 evenings.

## V1.1 — retention + publishing GA (~13 evenings)

| # | Item | Tag | Effort | Status |
|---|---|---|---|---|
| V1 | Persistent hook library w/ tags (W4) | WEDGE, MOAT | 2 ev | todo |
| V2 | Auto-transcribe top reels post-sync (W5) | WEDGE | 1.5 ev | todo |
| V3 | Weekly niche digest email (W6) | WEDGE | 2.5 ev | todo |
| V4 | Durable job queue + publish/transcribe migration (H1) | MOAT | 3 ev | todo |
| V5 | Relative "Outperforming" score + why-tooltip (W3) | WEDGE, MOAT | 1.5 ev | todo |
| V6 | Publishing GA: honest `partial` status, calendar consolidation, TikTok/YouTube app-audit follow-through | BLOCKER→V1.1 | 2 ev | todo |
| V7 | Event-log retention cron; dead-code sweep | — | 0.5 ev | todo |

## V2 — Arabic, Studio, GCC dataset

| # | Item | Tag | Status |
|---|---|---|---|
| X1 | Arabic UI: locale pref, `dir` plumbing, logical-property completion, Arabic font | MOAT | todo |
| X2 | Arabic-first script generation presets (Gulf dialect vs MSA toggle) | WEDGE, MOAT | todo |
| X3 | GCC niche dataset: cross-user trending per niche | MOAT | todo |
| X4 | Studio multi-account: multiple IG connections per user | MOAT | todo |
| X5 | Research platform abstraction consumed by a TikTok source (H2) | MOAT | todo |

## Explicitly deprioritized (do not invest without a reason)
- YouTube auto-reply — keep running, freeze investment, consider hiding on Free/Creator.
- TikTok publishing adapter — dormant until Meta/TikTok app audit passes.
- Growth-notes typed-reveal UI polish — cosmetic, no further investment.
- `/dashboard/my-account` insights charts expansion — maintain, don't grow.

## Session log
<!-- Append one entry per session: date, item(s) touched, what shipped, what's left, decisions made -->
- **2026-07-03 — L2 (W1), transcript-grounded scripts.** Shipped: `generate-script` route now selects `transcript, transcript_status, viral_score, view_count, posted_at`; when the transcript is `ready` it's passed to `generateScript` as the primary source and the caption becomes secondary. `lib/ai/claude.ts`: added transcript/perf grounding fields to `GenerateScriptInput`, a `<reel_transcript>` block (capped 8k chars) ordered before `<reel_caption>`, a "Source reel performance: score/views/posted N days ago" line, and updated the system prompt to ground on the transcript + extend the injection guard to `<reel_transcript>`. Route returns a `grounded` flag. `ScriptGenerator`: shows "Grounded on transcript ✓" (emerald) or "Caption only" chip, plus a one-tap "Transcribe first, then regenerate" that POSTs the existing transcript pipeline then re-runs generation. Decisions: only a `ready` transcript grounds (pending/failed → caption-only, not a hard error); chips gated on `reelId` so the paste-caption path is unaffected. Colors use raw emerald/amber/border classes to match the file — the L11 rebrand sweep will tokenize them. Typecheck clean.
- **2026-07-03 — L1 (B2), de-persona AI prompts.** Shipped: `brand_voice jsonb` on `profiles` (migration `20260703_profile_brand_voice.sql` + schema.sql, with select/update grants to `authenticated` — token-column posture untouched). `lib/ai/claude.ts`: replaced the two hardcoded `@majdst_codes` `SCRIPT_/GROWTH_SYSTEM_PROMPT` constants with `buildScriptSystemPrompt`/`buildGrowthSystemPrompt(bv)` builders + `BrandVoice` type; fields are length-capped before interpolation (self-injection/token guard); neutral creator persona when unset. Both AI routes read `profiles.brand_voice` and pass it through. Decisions: jsonb over columns (prompt-context only, never queried); de-dev-ified the generic fallback copy ("the audience", "a real example") so it reads for any niche. Left: the brand-voice **collection form** is part of onboarding (L7/B3) — until then every user gets the neutral persona, which is already correct/sellable. Typecheck clean.
- **2026-07-03 — L4 + L8 (B6, B5).** Shipped: (1) `reel-from-link` now calls `consumeUserAction(..., "transcript")` before the yt-dlp+Whisper pipeline — reuses the existing `transcript` bucket since it's the same pipeline. (2) New `upload_presign` action (default 60/hr, `RL_UPLOAD_PRESIGN_PER_HOUR`) enforced in `publishing/upload`. (3) `diag?transcribe=1` gated behind `DIAG_ALLOWED_USER_IDS` allowlist, **fail-closed** (unset ⇒ nobody); cheap metadata-only diag path stays open. (4) `vercel.json`: `publish-due` `0 0 * * *` → `*/5 * * * *`, added `poll-comments */10 * * * *`. No DB migration (RPC takes arbitrary `p_action`). Decisions: reel-from-link shares the transcript quota rather than a new bucket; diag fails closed rather than throttling. Left: L8 cadence assumes Vercel Pro is live before launch (founder decision #3); GH Actions fallback per B5 if Pro is rejected.
