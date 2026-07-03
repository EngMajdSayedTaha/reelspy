# 07 — V1.1 and V2 (detail behind the ROADMAP.md tables)

Do not start any of this until every Launch item in `TASKS.md` is checked off.

## V1.1 — retention + publishing GA (~13 evenings)
See full detail in their home files:
- **V1** Persistent hook library (W4) — `03-wedge-quality.md`
- **V2** Auto-transcribe top reels post-sync (W5) — `03-wedge-quality.md`
- **V3** Weekly niche digest email (W6) — `03-wedge-quality.md`
- **V4** Durable job queue (H1) — `06-hardening-debt.md`
- **V5** Relative "Outperforming" score (W3) — `03-wedge-quality.md`
- **V6** Publishing GA: honest `partial` status, calendar consolidation
  (`04-ui-ux.md` calendar row), TikTok/YouTube app-audit follow-through
- **V7** Event-log retention cron (extends H6's data-minimization note); dead-code sweep
  (`getReelInfo`, migration drift pairs — see `01-audit.md` item 8)

## V2 — Arabic, Studio, GCC dataset
- **X1** Arabic UI: locale pref, `dir` plumbing (foundation laid at Launch via
  `04-ui-ux.md` RTL section), logical-property completion, Arabic font, translated shell
- **X2** Arabic-first script generation presets (Gulf dialect vs MSA toggle in brand
  voice) — builds on W2's "write in the language of the user's brand voice"
- **X3** GCC niche dataset features: cross-user trending per niche from
  `ig_reel_snapshots` (the shared snapshot cache, see `01-audit.md`, is already the
  substrate) — e.g. "top hooks in UAE real-estate this week"
- **X4** Studio multi-account: multiple IG connections per user (schema change: move IG
  tokens off `profiles` into `social_connections`-style rows), workspace switcher
- **X5** Research platform abstraction (H2) consumed by a TikTok source

## Explicitly flagged as none of wedge/moat/blocker — don't invest without a reason
- **YouTube auto-reply** (`youtube_automations`, GH Actions poll, 3 components): serves
  neither the IG wedge nor the UAE beachhead. Keep it running (it's built and stable) but
  **freeze investment**; consider hiding it for Free/Creator tiers to sharpen positioning.
- **TikTok publishing adapter** pre-audit (posts forced private, `.env.example:108-110`):
  dormant until the audit passes; no work until V1.1 publishing GA.
- **Growth-notes typed-reveal UI polish** (recent commit `0d73c0e`): retention-neutral
  cosmetics; no further investment.
- **`/dashboard/my-account` insights charts expansion**: analytics of the user's own
  account is adjacent to the wedge (research is about *other* accounts); maintain, don't
  grow.
