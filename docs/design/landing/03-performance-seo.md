# ReelSpy Landing — Performance, SEO, Accessibility & Tech Constraints

> Companion to [`01-landing-page-brief.md`](./01-landing-page-brief.md). These are
> hard requirements, not suggestions — the landing page must be premium *and* fast.

---

## 1. Tech constraints (build inside the existing app)

- **Stack (already in repo — use it, add nothing heavy):** Next.js 16 App Router,
  React 19, Tailwind CSS v4 (tokens in `app/globals.css`), shadcn/radix,
  `lucide-react`, `next-themes`, `tw-animate-css`. i18n via the in-repo
  `lib/i18n` provider (EN/AR, `dirForLocale`).
- **Route:** the landing replaces `app/page.tsx` (currently `redirect("/login")`).
  Authenticated users must still land on `/dashboard` — do the auth check
  server-side (Supabase session via existing helpers) and redirect before render,
  so logged-in users never flash the marketing page.
- **Server-first:** the page is a Server Component; only the interactive demos,
  nav scroll state, and canvas scenes are `"use client"` islands, loaded with
  `next/dynamic` below the fold. Hero must render meaningful content with zero JS.
- **No new animation megadeps by default.** Prefer CSS animations/transitions,
  Web Animations API, and `IntersectionObserver`. If a library is truly needed for
  the hero scene, it must be lazy-loaded below-fold-priority and add **< 40KB gz**;
  do not import three.js for one effect — a 2D canvas or CSS 3D achieves the brief.
- **File org suggestion:** `components/landing/*` for sections and demos; shared
  landing tokens appended to `app/globals.css` under a `/* landing */` block.

## 2. Performance budgets (green Core Web Vitals on mid-range mobile)

| Metric | Budget |
|---|---|
| LCP | < 2.0s (lab, 4× CPU throttle, Fast 4G) |
| CLS | < 0.05 |
| INP | < 200ms |
| First-load JS for `/` | < 150KB gz total; < 60KB of it landing-specific |
| Largest single asset | < 120KB (OG image excluded) |

How to hit them:

- **LCP element = the H1** (text, not an image or canvas). Fonts are already
  `next/font` (self-hosted, no layout-shift); keep hero art `aria-hidden`,
  positioned so it never becomes LCP.
- Reserve explicit dimensions for every media/canvas slot (no CLS); demos animate
  inside fixed-size frames.
- Canvas scenes: lazy-init on first intersection, cap `devicePixelRatio` at 2,
  `requestAnimationFrame` loops stop when off-screen or tab hidden.
- Any raster images via `next/image` (AVIF/WebP); mock screens are DOM/SVG, not
  screenshots, so they're crisp at every DPR and cost ~0 bytes.
- No layout thrash: scroll effects via CSS scroll-driven animations or a single
  rAF-batched observer; never per-scroll `getBoundingClientRect` storms.
- Marquee/idle loops: pure CSS, `will-change: transform` used sparingly.
- Test with Lighthouse (mobile) + `npm run build` bundle output before shipping.

## 3. SEO requirements

- **Metadata** (extends the existing pattern in `app/layout.tsx`, which already
  sets `metadataBase`, template, OG/Twitter):
  - Title: `ReelSpy — Spot viral reels early, script them in your voice, post everywhere`
  - Description (~155 chars): `ReelSpy tracks the creators you admire, ranks which
    reels are over-performing right now, writes original AI scripts in your voice,
    and cross-posts to Instagram, TikTok, YouTube & Facebook.`
  - Canonical `/`; `openGraph.type: website`; a real **OG image** (1200×630) —
    dark indigo brand card with logo, headline, and gradient signal motif (static
    file or `opengraph-image.tsx`), and upgrade Twitter card to
    `summary_large_image`.
- **Structured data (JSON-LD, one `<script type="application/ld+json">`):**
  - `SoftwareApplication`: name ReelSpy, `applicationCategory: BusinessApplication`,
    `operatingSystem: Web`, `offers` with the four AED price points
    (`priceCurrency: "AED"`), url `https://reelspy.dev`.
  - `Organization` (name, url, logo).
  - `FAQPage` mirroring the on-page FAQ items exactly.
- **Semantics:** exactly one `<h1>` (hero); sections use `<section>` +
  sequential `<h2>`/`<h3>` — no skipped levels; FAQ uses native
  `<details>/<summary>` (indexable, works without JS); nav/footer landmarks
  (`<header> <nav> <main> <footer>`).
- **Copy for crawlers = copy for humans:** all feature claims render as real text
  server-side (nothing meaningful hidden behind JS-only rendering).
- `robots.ts` and `sitemap.ts` already exist — confirm `/` is included and
  indexable. Keep `/login`, `/signup` linked with plain `<a>`/`<Link>` for crawl
  paths.
- **Bilingual SEO:** if/when an Arabic route ships (e.g. `/?lang=ar` or `/ar`),
  add `alternates.languages` hreflang pairs; until then keep the language toggle
  a client preference and don't emit fake hreflang.

## 4. Accessibility (WCAG 2.1 AA)

- Contrast AA everywhere, both themes — check gradient-text words on `#090A18`
  and secondary text `#A2A2AD` on indigo cards.
- Full keyboard path: skip-to-content link, visible cyan focus rings, sheet menu
  focus-trapped, FAQ operable via keyboard, demo toggles are real `<button>`s
  with `aria-pressed`.
- All decorative art (nebula, radar, particles, mock screens) `aria-hidden="true"`
  with the message carried by adjacent real text; demos additionally get a one-line
  `sr-only` description of what they depict.
- `prefers-reduced-motion`: no parallax, no idle loops, no count-ups — instant
  final states, opacity-only reveals. `prefers-contrast: more` gets solid borders
  in place of hairlines.
- Language toggle sets `lang` and `dir` on `<html>`; announced with `aria-label`.
- Tap targets ≥44×44px; no content conveyed by color alone (score chips include
  text like `↑ 4.2×`, not just a green glow).

## 5. Quality gate before merge

1. `npm run lint` and `npm run build` pass clean.
2. Lighthouse mobile on `/`: Performance ≥ 90, SEO = 100, Accessibility ≥ 95,
   Best Practices ≥ 95.
3. Manual pass at 360/390/768/1024/1280/1536 widths — no horizontal scroll,
   nothing clipped.
4. Toggle dark/light and EN/AR (`dir="rtl"`) — layout mirrors, nothing breaks.
5. Disable JS: page still reads top-to-bottom with all copy, static frames in
   place of demos, working links.
6. `prefers-reduced-motion` emulation: zero movement beyond fades.
7. Logged-in user visiting `/` still reaches `/dashboard` with no marketing flash.
