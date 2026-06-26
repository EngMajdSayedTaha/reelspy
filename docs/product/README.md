# ReelSpy — Product Documentation

Three views of the same product, for three audiences.

| Document | Audience | What it covers |
|---|---|---|
| [**01 · Technical Documentation**](./01-technical-documentation.md) | Engineers, architects, technical evaluators | Architecture, data model, every core algorithm (virality score, rising-now velocity, snapshot dedup cache, Meta rate limiter, hook extraction, keyword matching), all subsystems, the security model, and recurring reliability patterns. Rich with diagrams. |
| [**02 · Customer Overview**](./02-customer-overview.md) | Customers, prospects, non-technical stakeholders | Plain-language tour: the problem, the 4-step loop, feature-by-feature breakdown, who it's for, before/after, and data privacy. |
| [**03 · Pitch Deck**](./03-pitch-deck.md) | Presentations, demos, sales | Marp slide deck — render to PDF / PPTX / HTML. |

## Diagrams

The Markdown files use **Mermaid** diagrams, which render automatically on
GitHub, GitLab, VS Code (with the Mermaid/Markdown Preview Mermaid extension),
Obsidian, and Notion.

## Turning the slide deck into slides

The pitch deck (`03-pitch-deck.md`) is [Marp](https://marp.app/)-formatted:

```bash
# PDF
npx @marp-team/marp-cli docs/product/03-pitch-deck.md -o reelspy.pdf

# PowerPoint
npx @marp-team/marp-cli docs/product/03-pitch-deck.md -o reelspy.pptx

# Self-contained HTML
npx @marp-team/marp-cli docs/product/03-pitch-deck.md -o reelspy.html
```

Or install the **"Marp for VS Code"** extension and use *Export Slide Deck…*.

## Exporting the long-form docs to PDF/Word

Any of the `.md` files can be converted with [Pandoc](https://pandoc.org/):

```bash
pandoc docs/product/01-technical-documentation.md -o reelspy-technical.pdf
pandoc docs/product/02-customer-overview.md      -o reelspy-overview.docx
```
