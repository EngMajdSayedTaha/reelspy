# 04 — UI/UX Enhancement Plan

## Screen-by-screen

| Screen | Findings | Fix (evening-fractions) |
|---|---|---|
| `/dashboard` (home) | 7 equal stat cards bury the loop; no "next action" for new users; counts fire 7 queries | Replace top row with a **Loop card** (Research → Transcribe → Script this week = mini WLC) + setup checklist (B3); demote vanity counts (0.5) |
| `/dashboard/feed` | Strongest screen. Rising-Now + filters + counts are good. Caption search is `ilike '%q%'` (`feed/page.tsx:181`) — no transcript search; 5 count queries per load | Add transcript to search (`or(caption.ilike,transcript.ilike)`); thumbnail `img` without aspect-ratio placeholder → CLS on mobile (0.5) |
| `/dashboard/generate/[reel_id]` | Good layout (sticky source reel). Generator ignores the transcript sitting above it (W1); no "regenerate with tweaks" retaining previous output | After W1: add variant regeneration keeping last result visible (0.5) |
| `/dashboard/scripts` | Generator + history in one page works. No search/filter by status; body text unbounded | Status filter chips + search; collapse long bodies (0.5) |
| `/dashboard/hooks` | Hidden from nav; ephemeral (see W4) | W4 covers it |
| `/dashboard/accounts` | Solid (groups, import-following, per-card sync). Business-Discovery-only limitation surfaced well in copy | Starter-pack path for unconnected users (part of B3) |
| `/dashboard/automations` | 3 tabs (IG/DM/YouTube) with event logs + diagnostics — genuinely good ops UX | Tier-gate creation (B1); no other launch work |
| `/dashboard/publishing` | Upload→compose→targets flow fine; failure visibility poor (B4); TikTok/YouTube audit flags force private posts (`.env.example:108-118`) — UI must say so | B4 + "posts will be private until app review passes" notice (0.25) |
| `/dashboard/calendar` | Dual data source (scripts by date, posts by datetime) visually merged — acceptable | Defer consolidation to V1.1 publishing GA |
| `/login` | prompt=consent noted as fixed in middleware comments; fine | — |

## Loading/skeleton states
Only `app/dashboard/loading.tsx` and `app/dashboard/feed/loading.tsx` exist. Add
`loading.tsx` (reusing `components/ui/skeleton.tsx`) for scripts, accounts, generate,
publishing, automations, my-account. Part of B7 / Roadmap L10.

## Mobile
Foundations are good: 16px inputs to kill iOS zoom (`globals.css:116-122`),
`touch-action: manipulation`, drawer sidebar, `min-[440px]` grid steps. Remaining: feed
thumbnails CLS; tables in cookie policy / event logs need `overflow-x-auto` audit;
`Toaster position="top-right"` (`app/layout.tsx:43`) collides with the mobile menu button.

## Aesthetic consistency
After B9's token swap, enforce: no raw Tailwind palette classes in new code — use
semantic tokens. The `sheen`/`stagger`/`rise` animation system with
`prefers-reduced-motion` fallbacks (`globals.css:201-290`) is a keeper and already fits
"terminal-meets-editorial".

## Accessibility basics
Icon buttons consistently carry `aria-label` (verified in `HooksExplorer.tsx:39`,
`Sidebar.tsx:89`) — good. Gaps: focus-visible rings on custom chip buttons
(`ScriptGenerator.tsx:176-209` platform/tone chips have no focus style); yellow-on-white
contrast in light mode is handled via `--brand: #a16207` but `--primary` used as text
anywhere would fail — audit after rebrand; add `aria-live` to `AiThinking` status
messages.

## RTL / Arabic-readiness debt (what breaks with `dir="rtl"` tomorrow)
- `app/layout.tsx:29`: `lang="en"` hardcoded, no `dir` plumbing — add
  `dir` from a locale pref now (cheap, inert).
- **Sidebar** (`components/layout/Sidebar.tsx:78-80`): `left-0`, `-translate-x-full`,
  `border-r` — the drawer would slide from the wrong side and the divider flips. Fix with
  `start-0`, logical border, and an RTL-aware transform (cheap now).
- Physical utilities across the tree (audit counts: 17×`left-`, 14×`pl-`, 13×`ml-`,
  9×`translate-x`, 6×`right-`): convert **opportunistically** to logical variants
  (`ms-/me-/ps-/pe-/start-/end-`) whenever a file is touched; do the Sidebar, TopBar,
  search inputs (`pl-9` + absolute `left-3` icons, e.g. `HooksExplorer.tsx:81-88`), and
  Toaster position now (~1 evening for the high-traffic set).
- Directional icons (`ArrowRight` in `dashboard/page.tsx:219`, chevrons) need
  `rtl:rotate-180` or logical swap — tag with a `// RTL` comment now, fix in V2.
- **Fonts**: Geist loads `subsets: ["latin"]` only (`app/layout.tsx:8-16`) — Arabic text
  would fall back to system fonts. V2: add an Arabic variable font (e.g. IBM Plex Sans
  Arabic) behind the locale.
- Already Arabic-safe: keyword matching uses Unicode property classes
  (`lib/auto-reply/keyword-match.ts:35-40`); Whisper transcribes Arabic and
  `transcript_lang` is stored (`schema.sql:118`); Claude writes Arabic (W2 prompt line).
