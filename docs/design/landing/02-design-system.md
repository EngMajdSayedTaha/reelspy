# ReelSpy Landing — Design System & Visual Language

> Companion to [`01-landing-page-brief.md`](./01-landing-page-brief.md). This file
> pins down colors, typography, surfaces, motion tokens, and brand usage so the
> landing page looks like it shipped from the same studio as the product dashboard.

---

## 1. Brand anchor

The ReelSpy logo (see `components/brand/Logo.tsx`, `public/brand/reelspy-logo-*.png`)
is a **deep-indigo rounded tile** with **violet→cyan "signal" glyphs**. The landing
page's entire palette derives from it:

| Role | Hex | Notes |
|---|---|---|
| Space black (page bg, darkest) | `#090A18` | Hero + Niche Radar sections |
| Deep indigo (section bg) | `#131631` | Alternate dark section background |
| Indigo surface (cards on dark) | `#222850` | Elevated cards, mock-screen chrome |
| Signal violet | `#6D5CFF` | Gradient start; interactive accents |
| Soft violet | `#A78BFF` | Gradient mid; secondary glow |
| Signal blue | `#4E7DFF` | Gradient mid; links on dark |
| Signal cyan | `#49E4FF` | Gradient end; "live/rising" pulses |
| Electric cyan | `#2FE0FF` | Sparks, count-up numbers, radar pings |

**Hero gradient (the one gradient):**
`linear-gradient(120deg, #6D5CFF 0%, #4E7DFF 45%, #49E4FF 100%)` — used for the
primary CTA, the wordmark accent, one hero headline word (e.g. gradient-clip
“unfair advantage”), and glow edges. Never use it on body text or large fills.

**Discipline:** ~90% of any viewport is neutral (space black / indigo / off-white);
the gradient and cyan pulses are the remaining ~10%. That restraint *is* the
premium look.

## 2. Neutrals & light mode

The app already defines a token system in `app/globals.css` (`--background`,
`--card`, `--muted-foreground`, `--border`, `--primary`, etc., with a `.dark`
class driven by `next-themes`). **Reuse those tokens for all UI chrome** (nav,
buttons, cards, FAQ, footer) so the landing inherits every color theme correctly.
Add landing-only tokens (namespaced, e.g. `--lp-space`, `--lp-indigo`,
`--lp-signal-*`) for the marketing-specific colors above.

- **Dark (primary presentation):** page `#090A18`/`#131631`; text `#E7E7EA` on
  dark, secondary `#A2A2AD`; hairline borders `rgba(255,255,255,0.08)` with a
  1px inner top-edge highlight on cards for the "machined" feel.
- **Light mode:** near-white `#F7F7F8` page, white cards, `#18181B` text —
  the marketing sections keep their dark hero/radar bands even in light mode
  (dark bands are brand-anchored, not theme-dependent), so light mode = light
  chrome + dark showpiece bands. Verify AA contrast in both.

## 3. Typography

- **Latin:** Geist (already loaded, `--font-geist-sans`); Geist Mono for score
  chips, code-ish labels, and the script-typing demo.
- **Arabic:** IBM Plex Sans Arabic (already loaded, `--font-arabic`), applied via
  `[lang="ar"]`.
- Scale (desktop → mobile, fluid with `clamp()`):
  - H1 64→40px, weight 600, tracking −2%, line-height 1.05
  - H2 44→30px, weight 600, tracking −1.5%
  - H3 24→20px, weight 600
  - Body 18→16px, weight 400, line-height 1.65, secondary color for paragraphs
  - Eyebrow/labels 13px, weight 500, +8% tracking, uppercase (never uppercase Arabic)
- Numbers in demos (scores, prices) use tabular figures (`font-variant-numeric:
  tabular-nums`) so count-ups don't jitter.

## 4. Surfaces, radius, elevation

- Radius: 12px controls, 16px cards, 24px mock-screen frames, full pill for chips.
- Cards on dark: `#131631→#222850` subtle vertical gradient + hairline border +
  soft ambient shadow `0 20px 60px rgba(9,10,24,0.55)`; hover adds a faint
  violet/cyan border-glow (`box-shadow: 0 0 0 1px rgba(109,92,255,0.35)`).
- Glass (nav, floating chips): `backdrop-blur(12px)` + `rgba(19,22,49,0.6)`.
- Mock screens get a browser-chrome header (three dots + `reelspy.dev/dashboard/…`
  address pill) to read instantly as *the product*.

## 5. Iconography & imagery

- Icons: `lucide-react` only, 1.5px stroke, matching text color; brand-gradient
  allowed on section-lead icons inside a soft indigo tile (mirrors the logo motif).
- Platform marks (Instagram, TikTok, YouTube, Facebook) rendered monochrome
  neutral; never recolor them with the brand gradient.
- No stock photos, no illustrations of people. Product imagery = the animated mock
  screens (DOM/SVG) and abstract signal fields (particles, radar rings, gradient
  nebulae). Reel "thumbnails" in mocks are abstract gradient placeholders, never
  real people's content.

## 6. Motion tokens

| Token | Value | Use |
|---|---|---|
| `--ease-out-expo` | `cubic-bezier(0.22, 1, 0.36, 1)` | reveals, FLIP re-rank |
| `--ease-spring` | spring(1, 80, 12) equivalent | tilt, magnetic CTA |
| Duration / fast | 150ms | hovers, chips |
| Duration / base | 300ms | card reveals |
| Duration / slow | 600ms | section reveals, radar sweep |
| Stagger | 60–90ms | card grids, list items |
| Idle loops | 6–14s | hero drift, nebula, marquee, radar |

Rules: animate only `transform` and `opacity` (compositor-friendly); one idle loop
running per viewport at a time; everything pauses off-screen
(`IntersectionObserver`); `prefers-reduced-motion` swaps all of it for opacity-only
reveals and freezes demos on their most informative frame.

## 7. Buttons & CTAs

- **Primary:** brand gradient fill, white text, pill or 12px radius, subtle inner
  highlight; hover = slight scale (1.02) + glow bloom; magnetic pull ≤8px on
  desktop pointer only.
- **Secondary/ghost:** transparent, hairline border, text color; hover fills with
  `rgba(255,255,255,0.06)`.
- Focus states: 2px cyan focus ring (`#49E4FF` at 60%), always visible for
  keyboard users, never removed.

## 8. RTL & bilingual rules

- All layout via CSS logical properties (`margin-inline-start`, `inset-inline-end`…).
- Directional assets (arrows, the 4-step loop, publish fan-out paths, marquee
  direction) must mirror under `dir="rtl"`.
- Latin numerals may remain in Arabic UI (matches the product); prices read
  `AED 149` in EN and `149 درهم/شهر` styling-equivalent in AR — keep the tabular
  alignment either way.
- Never letter-space or uppercase Arabic text; line-height for Arabic body ≥1.8.
