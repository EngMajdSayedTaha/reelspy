# ReelSpy — Product Documentation

Three views of the same product, for three audiences. See [`../README.md`](../README.md)
for the full documentation map (business rules, runbooks, infrastructure).

| Document | Audience | What it covers |
|---|---|---|
| [**01 · Technical Documentation**](./01-technical-documentation.md) | Engineers, architects, technical evaluators | Architecture, data model, every core algorithm (virality score, out-performance ranking, rising-now velocity, snapshot dedup cache, Meta rate limiter, suggestion waterfall, hook extraction, keyword matching), all subsystems (billing, admin, onboarding, Niche Radar, i18n…), the security model, and recurring reliability patterns. Rich with diagrams. |
| [**02 · Customer Overview**](./02-customer-overview.md) | Customers, prospects, non-technical stakeholders | Plain-language tour: the problem, the 4-step loop, feature-by-feature breakdown, plans & pricing, who it's for, and data privacy. |
| [**03 · Pitch Deck**](./03-pitch-deck.md) | Presentations, demos, sales | Marp slide deck — render to PDF / PPTX / HTML. |

> **The `.md` files are canonical.** The `.pdf` / `.pptx` / `.html` files beside
> them are generated snapshots and may lag behind — regenerate them after any
> Markdown edit (commands below).

## Diagrams

The Markdown files use **Mermaid** diagrams, which render automatically on
GitHub, GitLab, VS Code (with the Mermaid preview extension), Obsidian, and Notion.

## Regenerating the human-friendly formats

Slide deck (Marp):

```bash
npx @marp-team/marp-cli docs/product/03-pitch-deck.md -o docs/product/reelspy-pitch-deck.pdf
npx @marp-team/marp-cli docs/product/03-pitch-deck.md -o docs/product/reelspy-pitch-deck.pptx
npx @marp-team/marp-cli docs/product/03-pitch-deck.md -o docs/product/reelspy-pitch-deck.html
```

Long-form docs → PDF/Word ([Pandoc](https://pandoc.org/)):

```bash
pandoc docs/product/01-technical-documentation.md -o docs/product/01-technical-documentation.pdf
pandoc docs/product/02-customer-overview.md       -o docs/product/02-customer-overview.pdf
```

Or open the Markdown in VS Code and print/export — any renderer that supports
Mermaid works.
