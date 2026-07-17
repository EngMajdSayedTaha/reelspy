# Landing Page Design Pack

Spec files for designing/building the ReelSpy public landing page — written to be
fed directly into Claude design (or any AI design/build tool) as prompts.

| File | What it is | How to use |
|---|---|---|
| [`01-landing-page-brief.md`](./01-landing-page-brief.md) | **Master brief** — product understanding, creative direction, full section-by-section page structure with copy, 3D & interactive-screen concepts, responsiveness rules | Feed this **first / as the main prompt** |
| [`02-design-system.md`](./02-design-system.md) | Colors (brand indigo + violet→cyan), typography (Geist / IBM Plex Sans Arabic), surfaces, motion tokens, RTL rules | Attach alongside the brief |
| [`03-performance-seo.md`](./03-performance-seo.md) | Hard requirements: Core Web Vitals budgets, SEO/metadata/JSON-LD, accessibility, tech constraints for this repo | Attach alongside the brief |

**Suggested prompt when feeding Claude design:**

> Build the ReelSpy landing page exactly per the attached spec. `01` is the master
> brief (structure, copy, interactions), `02` is the visual system, `03` is the
> non-negotiable performance/SEO/accessibility bar. Where the spec is silent, match
> the premium, restrained direction it describes. Do not invent features, numbers,
> or testimonials not present in the spec.

Product facts in these files were verified against the codebase and
[`docs/BUSINESS-LOGIC.md`](../../BUSINESS-LOGIC.md) /
[`docs/product/02-customer-overview.md`](../../product/02-customer-overview.md)
on 2026-07-17. If plans or features change, update the brief in the same PR.
