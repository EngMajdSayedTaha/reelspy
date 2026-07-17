# ReelSpy — Landing Page Master Design Brief

> **Feed this file to Claude design as the primary prompt.** It contains everything
> needed to design and build the ReelSpy public landing page: what the product is,
> who it's for, the exact page structure section by section, the copy, the 3D and
> interaction concepts, and the quality bar. Companion files:
> [`02-design-system.md`](./02-design-system.md) (colors, type, tokens, motion rules)
> and [`03-performance-seo.md`](./03-performance-seo.md) (Core Web Vitals budgets,
> SEO, accessibility, tech constraints). Treat all three as one spec.

---

## 0. The assignment in one paragraph

Design a **premium, fully responsive marketing landing page** for **ReelSpy**
(reelspy.dev) that makes a first-time visitor *feel* the product in under 10 seconds:
a dark, cinematic, indigo-to-cyan world with tasteful 3D depth and **interactive
product screens** — live-feeling dashboard mockups that animate as you scroll. The
page must read like a product from a top-tier SaaS studio (think Linear, Vercel,
Framer-level polish), load fast enough to score green Core Web Vitals, rank well on
SEO, and convert visitors to sign-ups. It replaces the current root route
(`app/page.tsx`, today a bare redirect to `/login`).

---

## 1. What ReelSpy is (understand this before designing anything)

**One-liner:** ReelSpy is your unfair advantage for short-form video. It watches the
creators you admire, tells you exactly which of their reels are **over-performing
right now**, learns what made them work, helps AI write an **original script in your
voice**, then **posts it everywhere for you**.

**The product is a dashboard SaaS** (Next.js + Supabase) built around a 4-step loop:

1. **WATCH** — the user adds Instagram accounts they want to learn from (or takes a
   niche quiz and gets curated suggestions). ReelSpy imports their reels
   automatically and keeps them fresh.
2. **SPOT** — every reel gets a **virality score** (comments ×3, likes ×1, views
   ×0.01 — a comment means someone *cared*). The feed's default ranking is
   **out-performance**: each reel compared to *that account's own average*, so a
   small creator's breakout hit outranks a big account's ordinary post. A **"Rising
   Now"** shelf ranks by growth-per-hour to catch reels exploding this week.
   **Niche Radar** shows what's over-performing across the user's *entire niche*,
   powered by anonymized cross-user intelligence — the product's moat.
3. **CREATE** — pick a reel for inspiration; ReelSpy can **transcribe** it (Whisper)
   so you study the exact hook. The **Hook Library** collects every transcribed
   opening line, searchable and ranked. Then **Claude AI writes an original script**
   — hook, body, call-to-action — in the user's saved **brand voice**, in English or
   Arabic (Gulf or MSA). Never a copy; its own topic and angle.
4. **PUBLISH** — upload the finished video once, cross-post to **Instagram,
   Facebook, TikTok, and YouTube** with per-platform captions and scheduling
   (drag-and-drop content calendar). Studios can switch between up to 5 IG accounts.

**Bonus engine:** **Auto-Reply (comment-to-DM)** — a keyword comment ("link") gets an
instant public reply *and* a private DM with the user's link, 24/7, on Instagram and
YouTube. Plus **My IG**: analytics on the user's own account with AI growth tips
based on their real numbers.

**Audiences:** short-form content creators; agencies & social teams managing
multiple accounts; growth marketers chasing trends early; niche experts turning
expertise into reels. The product is **bilingual — English and Arabic with full RTL**
— and priced in **AED** (Gulf market first).

**Trust facts (safe to state on the page):** per-user data isolation; social tokens
stored server-side and never exposed to the browser; reads only public data from
tracked accounts; anonymized niche intelligence (nobody sees what you track); full
data export and account deletion anytime; built on Next.js + Supabase + Vercel with
row-level security; paid plans run on Claude (Sonnet/Opus).

**Pricing (real numbers — use them):**

| | Free | Creator | Pro | Studio |
|---|---|---|---|---|
| Price | AED 0 | AED 49/mo | AED 149/mo | AED 349/mo |
| Tracked accounts | 3 | 30 | 50 | 100 |
| AI scripts / month | 10 | 60 | 200 | Unlimited |
| Transcripts / month | 5 | 30 | 100 | Unlimited |
| Auto-replies | — | 15 | 30 | 60 |
| Publishing | — | ✔ | ✔ | ✔ + 5 IG accounts |
| AI model | Standard | Claude Sonnet | Claude Opus | Claude Opus |

There is also a **"Build your own plan"** with live-priced sliders (accounts,
scripts, auto-replies, publish targets) — tease it under the pricing table.

---

## 2. Creative direction

**Feel:** cinematic control room for content intelligence. Dark-first, deep indigo
space (`#090A18` → `#131631`) with a **violet → cyan** signal gradient
(`#6D5CFF → #A78BFF → #4E7DFF → #49E4FF → #2FE0FF`) used *sparingly* — on the wordmark
accent, primary CTA, live data glows, and one hero gradient. Everything else is calm:
soft off-whites, graphite surfaces, generous whitespace, 12–16px radii, hairline
borders with subtle inner glow on hover. Premium = restraint + depth + motion
quality, not more effects. Light mode must exist and look equally deliberate
(see `02-design-system.md`), but **dark is the hero presentation**.

**3D philosophy:** depth, not gimmicks. Use **CSS 3D transforms + layered
parallax + WebGL only where it earns its cost** (one lazy-loaded hero scene at
most). Every 3D/motion element must degrade gracefully: static composed frame on
`prefers-reduced-motion`, on low-end devices, and before hydration. The page must
be beautiful with JavaScript disabled.

**Interactive screens:** the landing page's signature move. Instead of static
screenshots, build **animated, self-driving mock dashboard components** (pure
DOM/CSS/SVG — not videos, not iframes of the real app) that demonstrate the product:
a feed that re-ranks itself, a script that types itself, a publish action that fans
out to four platforms. Each one runs its loop when scrolled into view, pauses
off-screen, and is keyboard/hover explorable.

---

## 3. Page structure — section by section

Build in this order. Copy is provided; refine tone but keep the claims (they are
verified against the product — do not invent features or numbers).

### 3.1 Navigation (sticky, glass)
- Left: ReelSpy logo (indigo rounded tile + violet→cyan signal glyph — asset exists
  at `public/brand/`, component `components/brand/Logo.tsx`).
- Center links: **Features · How it works · Pricing · FAQ** (smooth-scroll anchors).
- Right: language toggle (**EN / عربي**), **Log in** (ghost), **Start free**
  (gradient CTA).
- Behavior: transparent over hero → frosted glass (`backdrop-blur`) + hairline
  border after ~80px scroll. Collapses to a slide-in sheet on mobile. Active-section
  highlighting on the anchors.

### 3.2 Hero (the 10-second sell)
- **Eyebrow:** `For creators, agencies & growth teams`
- **H1:** `Your unfair advantage for short-form video.`
- **Sub:** `ReelSpy watches the creators you admire, spots which reels are
  over-performing right now, writes original scripts in your voice — and posts them
  to Instagram, TikTok, YouTube & Facebook at once.`
- **CTAs:** `Start free — no card needed` (primary gradient, magnetic hover) ·
  `See how it works ↓` (ghost, smooth-scrolls to §3.4).
- **Trust strip under CTAs:** `Free plan forever · English & العربية · Your data
  stays yours`.
- **3D centerpiece (right side / behind on mobile):** a floating, perspective-tilted
  **dashboard feed card stack** — 3–4 layered reel cards in 3D space, slowly
  drifting on idle, tilting toward the cursor (max ~6°), each card showing a reel
  thumbnail placeholder, a virality score chip, and an out-performance badge like
  `↑ 4.2× above average`. One card periodically "goes viral": its score counts up,
  it glows cyan and rises to the front of the stack. Behind the stack: a subtle
  slow-rotating particle field / gradient nebula in brand colors (canvas or CSS,
  lazy, paused off-screen).
- Scroll cue: mouse/chevron micro-animation at the fold.

### 3.3 Logo/social-proof strip
Row of platform marks the product actually connects: **Instagram · TikTok · YouTube ·
Facebook**, plus `Powered by Claude AI` and `Built on Supabase + Vercel`. Muted
monochrome, gentle infinite marquee (pausable, reduced-motion-safe).

### 3.4 Problem → the loop (narrative pivot)
- **H2:** `Growing on Reels shouldn't be a guessing game.`
- Five pain points as short cards that stagger in: learn what worked *after* it's
  old news · hours stalking competitors · blank page every script · uploading the
  same video 4× · "link please" comments answered by hand.
- Pivot line: `ReelSpy turns all of that into a loop.` → animated **4-step loop
  diagram** (WATCH → SPOT → CREATE → PUBLISH → back to WATCH): a glowing dot travels
  the circuit; each node lights up with a one-line caption. This diagram is the
  page's conceptual anchor — make it iconic, simple, and RTL-mirrorable.

### 3.5 Feature deep-dives — the interactive screens
Four alternating full-width blocks (text one side, interactive mock screen the
other; stacked on mobile). Each mock is a **self-driving animated component**:

1. **Spot true outliers** — *Interactive feed demo:* a mini feed of 5 reel cards
   sorted by out-performance. On loop: scores count up, cards **re-rank with FLIP
   animations**, a "Rising Now" rail slides in. A small toggle lets visitors switch
   sort between `Out-performance` and `Viral score` and watch the order change —
   that interaction *teaches the differentiator*. Copy: `Every reel is scored — and
   ranked against that account's own average. A small creator's breakout beats a big
   account's ordinary post, so you study what actually broke out.`
2. **Steal the structure, never the content** — *Transcript + Hook demo:* a reel
   card "transcribes" itself (lines of text materialize), the first line detaches
   and files itself into a **Hook Library** list alongside other hooks with scores.
   Copy: `Transcribe any reel. See the exact opening line that stopped the scroll.
   Collect every winning hook in one searchable library.`
3. **Original scripts in your voice** — *Script generation demo:* a compact
   generator panel; visitor can pick voice chips (`English · العربية · Gulf · MSA`),
   then a script **types itself** in three labeled parts — HOOK / BODY / CTA — with
   a blinking caret and a `Written by Claude` chip. If Arabic is picked, the demo
   types RTL. Copy: `Point at any reel for inspiration. Claude writes a fresh hook,
   body and call-to-action in your brand voice — its own topic, its own angle,
   never a copy.`
4. **Post everywhere. Reply to everyone.** — *Publish + Auto-reply demo:* one video
   tile fans out along animated paths to four platform nodes (IG/FB/TikTok/YouTube)
   with per-platform caption chips and a scheduling clock; below it, a mini chat
   sim: a comment `link please 🙏` appears → instant public reply + a DM bubble
   slides in. Copy: `Upload once, publish to four platforms with per-platform
   captions and scheduling. And every keyword comment gets an instant reply plus a
   DM — 24/7.`

### 3.6 Niche Radar — the moat (showpiece section)
Full-bleed dark section. **H2:** `Your niche has a pulse. Now you can see it.`
Centerpiece: a **radar/orbit visualization** — concentric rings with account nodes
orbiting slowly; over-performing nodes pulse cyan and drift toward center; a
sweeping radar line reveals labels (`↑ 6.1× · fitness`). SVG/canvas, slow, elegant,
parallax on scroll. Copy: `ReelSpy anonymously aggregates what all its users track
and shows what's over-performing across your entire niche right now — intelligence
no single account-watcher can give you.` Include the anonymity reassurance.

### 3.7 Everything else you get (bento grid)
Compact 6–8 tile bento with micro-animations on hover: **My IG analytics + AI growth
tips · Content calendar (drag-and-drop) · Account groups & bulk import · Niche quiz
& starter packs · Light/dark + color themes · English & العربية (full RTL) · Data
export anytime · Multi-account for studios (5 IG)**.

### 3.8 Pricing
- **H2:** `Start free. Upgrade when you're growing.`
- Four cards (table data in §1). **Pro is highlighted** `Most popular`; Studio
  labeled `For teams & studios`. Free CTA: `Start free`; paid CTAs: `Get Creator`
  etc. Cards get a subtle 3D hover lift; the highlighted card has a slow animated
  gradient border.
- Below: **Build-your-own teaser** — a decorative slider row (`accounts · scripts ·
  auto-replies · platforms`) with a live-updating fake price, linking to sign-up:
  `Don't fit a box? Build your own plan with sliders — priced live.`
- Footnote: prices in AED; billing handled by Stripe.

### 3.9 Before / after (conversion reinforcement)
Two-column comparison, animating row by row on scroll — left column muted/struck,
right column brand-lit. Rows: hunt for trends → ranked for you · guess the hook →
see it transcribed · blank page → script in seconds · upload 4× → upload once ·
miss leads → auto-reply + DM · wonder what to change → data-driven growth tips.

### 3.10 FAQ (accordion, feeds SEO)
6–8 items with honest answers: Is it really free? (yes — 3 accounts, 10 scripts &
5 transcripts a month, forever) · Do you copy other people's content? (no — scripts
are original; you study *structure*) · Which platforms? · Does it work in Arabic?
(yes — full RTL, Gulf & MSA voices) · Is my data private? (isolation, anonymized
trends, server-side tokens, export/delete anytime) · Which AI? (paid = Claude
Sonnet/Opus) · Can agencies use it? (Studio: 100 tracked accounts, 5 IG accounts) ·
Do I need to install anything? (no — runs in the browser). Use semantic
`<details>`-style disclosure + FAQ JSON-LD (see `03-performance-seo.md`).

### 3.11 Final CTA
Full-width gradient-nebula band echoing the hero. **H2:** `Stop guessing. Start
spotting.` Sub: `Sign up free, take the niche quiz, and see what's rising in your
niche in minutes.` One primary CTA: `Start free — no card needed`. Optional
mini-loop diagram reprise.

### 3.12 Footer
Logo + one-liner · columns: Product (Features, Pricing, FAQ) · Company (Privacy →
`/privacy`, Terms → `/terms`, Cookies → `/cookies`) · Log in / Sign up · language
toggle · `© ReelSpy` + `Built with Next.js · Supabase · Claude`. Quiet, spacious.

---

## 4. Global interaction & motion inventory

- **Scroll choreography:** every section reveals once with short staggered
  fade/rise (150–350ms, custom ease `cubic-bezier(0.22, 1, 0.36, 1)`); parallax
  only on hero art, radar, and final band (≤40px translation). Prefer CSS
  scroll-driven animations / `IntersectionObserver`; no heavy scroll-jacking, no
  horizontal-scroll hijacks.
- **3D:** perspective card stacks and tilt-on-hover (max ~6°, spring-smoothed);
  bento/pricing hover lift (translateY + shadow + border-glow). At most **one**
  WebGL/canvas scene (hero nebula or radar) — lazy-loaded, paused when off-screen,
  capped device-pixel-ratio.
- **Micro-interactions:** magnetic primary CTA; count-up numbers on view; FLIP
  re-ranking in the feed demo; typing effect in the script demo; marquee pause on
  hover/focus.
- **All motion respects `prefers-reduced-motion`** — swap to opacity-only reveals
  and freeze demos on their most informative frame.
- **RTL:** every directional animation, arrow, and layout must mirror under
  `dir="rtl"`. Use CSS logical properties throughout. The site is EN/AR bilingual —
  design with string expansion (~25%) and Arabic type (`IBM Plex Sans Arabic`) in
  mind from the start.

---

## 5. Responsiveness

Breakpoints: mobile ≤640 · tablet 641–1024 · desktop 1025–1440 · wide >1440 (cap
content at ~1200–1280px). Mobile: nav → sheet; hero stack becomes a single gently
floating card behind/below the copy; alternating feature blocks stack
(screen-first); bento → 2-col then 1-col; pricing cards → snap-scroll carousel with
Pro first; radar scales down but keeps its pulse. Tap targets ≥44px. No horizontal
page scroll at any width. Test at 360, 390, 768, 1024, 1280, 1536.

---

## 6. Deliverable & tech constraints (summary — details in `03-performance-seo.md`)

- Next.js 16 App Router + React 19 + Tailwind v4 + shadcn/radix + `lucide-react` +
  `next-themes` (already in the repo). Landing replaces `app/page.tsx`; authed
  users keep getting redirected to `/dashboard`.
- Server components by default; hydrate only the interactive demos (`"use client"`
  islands, `next/dynamic`).
- Use existing design tokens from `app/globals.css` — extend, don't fork
  (see `02-design-system.md`).
- Ship green Core Web Vitals (LCP < 2.0s, CLS < 0.05, INP < 200ms), full metadata,
  OG image, JSON-LD, semantic headings, WCAG AA contrast.

**Definition of done:** a stranger scrolls the page on a mid-range phone and can
say what ReelSpy does, why it's different (out-performance + Niche Radar + original
AI scripts + one-tap cross-posting + auto-reply), what it costs, and how to start —
and the page *felt* like a premium product the whole way down.
