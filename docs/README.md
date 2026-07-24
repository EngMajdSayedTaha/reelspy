# ReelSpy Documentation

> **Start here.** This folder is the single source of truth for what ReelSpy is,
> how it works, and every business rule it enforces. If a claim here disagrees
> with the code, the code wins — and this folder should be fixed in the same PR.
>
> **Last full audit:** 2026-07-16 (repo state: master @ `5a617eb`).

## For AI agents

Read these in order before making product or business-logic decisions:

1. [`BUSINESS-LOGIC.md`](./BUSINESS-LOGIC.md) — **every business rule in one file**: plans, prices, entitlements, quotas, scoring formulas, suggestion fallbacks, sync budgets, fail-open behavior. Each rule cites the source file.
2. [`product/01-technical-documentation.md`](./product/01-technical-documentation.md) — architecture, data model, algorithms, subsystems, security model.
3. `Plan_Reelspy/` (repo root, not in docs/) — the planning workspace: roadmap, task lists, audits. **Historical/working documents** — where they conflict with docs/, docs/ is current. Known drift: `Plan_Reelspy/CLAUDE.md` still lists old prices (AED 69/299) and an old model split; the live values are in `BUSINESS-LOGIC.md` §1.

## For humans

| Document | Audience | What it covers |
|---|---|---|
| [`product/02-customer-overview.md`](./product/02-customer-overview.md) | Customers, prospects, anyone | Plain-language product tour — no jargon |
| [`product/03-pitch-deck.md`](./product/03-pitch-deck.md) | Presentations | Marp slide deck (render to PDF/PPTX) |
| [`BUSINESS-LOGIC.md`](./BUSINESS-LOGIC.md) | Founder, ops, support | The rulebook: what each plan gets, all limits, all formulas |
| [`product/01-technical-documentation.md`](./product/01-technical-documentation.md) | Engineers | Full technical reference with diagrams |

PDF versions live in `product/` next to the Markdown. **The `.md` files are canonical**; regenerate PDFs after editing (see [`product/README.md`](./product/README.md)).

## Operational runbooks (setup + on-call)

| Runbook | When you need it |
|---|---|
| [`google-supabase-setup.md`](./google-supabase-setup.md) | First-time env + Supabase + Google OAuth setup |
| [`billing-setup.md`](./billing-setup.md) | Provisioning Stripe (keys, prices, webhook) |
| [`publishing-setup.md`](./publishing-setup.md) | Cross-posting setup: Meta, TikTok, YouTube, Cloudflare R2 |
| [`auto-reply-setup.md`](./auto-reply-setup.md) | Comment→DM automation: Meta webhook + tokens |
| [`ig-cookies-runbook.md`](./ig-cookies-runbook.md) | Transcript pipeline cookies: rotation + health check |
| [`cron-cadence.md`](./cron-cadence.md) | Vercel Hobby vs Pro cron layout, GitHub Actions workers |
| [`domain-migration.md`](./domain-migration.md) | Domain history + the app.reelspy.dev subdomain split (founder actions) |

## Live infrastructure (quick reference)

| Piece | Value |
|---|---|
| Production (app) | https://app.reelspy.dev (Vercel project `reelspy`; also reachable at `reelspy-one.vercel.app`) |
| Production (marketing) | https://reelspy.dev (Vercel project `reelspy-landing`) — proxies `/api`, `/privacy`, `/terms`, `/cookies`, `/brand` to the app; redirects `/login`, `/signup`, `/dashboard`, `/admin`, `/auth` to `app.reelspy.dev` |
| GitHub | `EngMajdSayedTaha/reelspy`, default branch `master`, auto-deploys to prod |
| Supabase | project ref `bsyzjlvgcpdxtdchkiva` (us-east-1, Free plan). GitHub integration pushes `supabase/migrations/` on merge to master |
| Video storage | Cloudflare R2 bucket (`publish-media`) — Supabase Storage is **not** used for video (Free-plan 50 MB cap) |
| Email | Resend, sender on reelspy.dev (`EMAIL_FROM`) |
| Cron | 2 daily Vercel crons + GitHub Actions workers (Hobby 2-cron cap) — see `cron-cadence.md` |
| Env catalog | `.env.example` at repo root — documented, exhaustive, kept current |

### Known production gaps (verified live 2026-07-16)

- **Migration `20260704130000_ig_connections.sql` (X4 Studio multi-account) is NOT applied in prod** — the `ig_connections` table doesn't exist. Code fails open to single-connection behavior. Apply via Supabase MCP `apply_migration` to activate.
- ~~Migration `20260708000000_custom_plan.sql` (B4 build-your-own plan) is NOT applied in prod~~ — **APPLIED 2026-07-24** (`subscriptions.custom_entitlements` now exists; without it the Stripe webhook 500'd on every subscription upsert).
- Stripe keys (`STRIPE_SECRET_KEY` etc.) and `ANTHROPIC_API_KEY` were not yet provisioned at last audit — billing runs in preview mode and paid-tier AI falls back accordingly (both fail open by design).
- The live `supabase_migrations.schema_migrations` history uses apply-time timestamps for several 2026-07-07…15 migrations, so version numbers differ from repo filenames (names match). Schema objects are present (verified); reconcile the history before relying on `supabase db push` no-op behavior.

**Payment hardening (2026-07-24):** billing emails (welcome / receipt / dunning / cancellation / refund / dispute alert), refund flow (admin UI + `charge.refunded` webhook; full refund → cancel), and webhook idempotency were added. Migration `20260724101832_billing_events.sql` **is applied in prod** (idempotency log). Still gated on Stripe keys + Resend keys (`RESEND_API_KEY`, `EMAIL_FROM`, `BILLING_ALERT_EMAIL`) — all fail open. See [`billing-setup.md`](./billing-setup.md).

## Keeping this folder honest

- Ship a user-visible behavior change, a new limit, a price change, or a schema change → update `BUSINESS-LOGIC.md` (and the technical doc if architecture moved) **in the same PR**.
- New external setup steps → new or updated runbook in this folder.
- Migrations: add under `supabase/migrations/` with a real UTC timestamp **and mirror into `supabase/schema.sql`** (see `supabase/migrations/README.md`).
