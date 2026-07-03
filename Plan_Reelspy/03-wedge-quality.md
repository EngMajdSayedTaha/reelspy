# 03 — Wedge Quality Pass (research→script feels magical)

## W1. Ground scripts on transcripts + hooks — 2 evenings [WEDGE] · Roadmap: L2
In `app/api/generate-script/route.ts:55-70`, select `transcript, transcript_status,
viral_score, view_count` too; build the user message as: transcript (when ready) →
labeled `<reel_transcript>`, caption as secondary context, plus "this reel scored X,
posted N days ago". Show a "grounded on transcript ✓ / caption only" chip in
`ScriptGenerator` results. One-tap "transcribe first, then generate" when transcript is
missing (pipeline already exists).

## W2. Claude for paid tiers + prompt engineering — 2 evenings [WEDGE] · Roadmap: L3
- `lib/ai/provider.ts`: route by tier — paid → `callAnthropic` with Haiku 4.5
  (`claude-haiku-4-5-20251001`) default, Sonnet for Pro/Studio; free → existing NVIDIA
  path. Fix `DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6"` (`provider.ts:22`) — pin
  current model IDs.
- Use Anthropic **tool-use forced JSON** (single tool `emit_script` with hook/body/cta
  schema) instead of "respond ONLY with JSON" — deletes the quote-normalization/
  control-char/salvage stack (`claude.ts:57-136`) for the Claude path.
- Prompt upgrades to `SCRIPT_SYSTEM_PROMPT`: interpolate brand voice (B2);
  platform-specific structure blocks (Reels vs LinkedIn vs TikTok — currently the
  platform string is passed but the prompt gives no per-platform guidance); tone
  definitions ("Direct = …"); require the hook to use a *different* opening pattern than
  the source; Arabic-readiness: "write in the language of the user's brand voice"
  (Arabic output works today via Claude; the English-only prompt text is the blocker).
- `GROWTH_SYSTEM_PROMPT` (`claude.ts:24`): de-persona (B2) and feed it captions +
  posted_at weekday/hour buckets (already available in `growth-notes/route.ts:78-84`,
  currently sends only type/likes/comments/timestamp).

## W3. Relative scoring ("engagement rate") — 1.5 evenings [WEDGE][MOAT] · Roadmap: V5
Keep `viral_score` (don't fight the generated column); add a computed **relative score**
at read time: `viral_score / greatest(followers_count,1000)` via the existing
`inspiration_accounts` join in `feed/page.tsx:147-154`, surfaced as the default sort
option "Outperforming". Add a "why" tooltip (×N vs account median — median from a small
window function query). This makes small-niche UAE accounts visible, which is the actual
customer's world.

## W4. Persistent hook library — 2 evenings [WEDGE][MOAT] · Roadmap: V1
New `saved_hooks` table (user_id, reel_id FK, text, tags text[], source
'transcript'|'manual', created_at; RLS as per `tracked_reels` pattern). "Save hook" action
on `TranscriptPanel` + `HooksExplorer` rows; tag filter chips; "Use in script" button that
passes the hook into `ScriptGenerator`'s custom context. Restore the nav entry
(`Sidebar.tsx:32-33`). Auto-suggest save for hooks from reels above the outperform
threshold. The accumulated per-niche hook corpus is moat data.

## W5. Auto-transcribe top reels after sync — 1.5 evenings [WEDGE] · Roadmap: V2
After a successful sync (`app/api/ig/sync/route.ts`), enqueue transcription for the top 3
untranscribed reels by score (respecting the per-user transcript quota + a per-tier cap).
Until the job queue (H1) exists, run inline via `after()` like the webhook route does
(`webhooks/route.ts:113`). This is what makes hooks/scripts feel instant instead of
"click and wait 90s".

## W6. Weekly niche digest email — 2.5 evenings [WEDGE, V1.1] · Roadmap: V3
Weekly cron → per user: top 5 rising reels (reuse `rankRising`, `feed/page.tsx:44-57`)
across their groups + 3 saved-hook suggestions + WLC nudge ("you researched 12 reels,
generated 0 scripts"). Needs B4's email infra. This is the retention loop for a
weekly-cadence product; scheduled after launch blockers.
