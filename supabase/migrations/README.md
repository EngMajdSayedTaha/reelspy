# Supabase migrations

Applied to production (`bsyzjlvgcpdxtdchkiva`) via the **GitHub ↔ Supabase
integration**: merging to `master` runs `supabase db push`, which applies every
file here whose version isn't yet in `supabase_migrations.schema_migrations`.

## Naming — required

`<version>_<name>.sql`, where **version is a 14-digit UTC timestamp**
(`YYYYMMDDHHMMSS`) and strictly increasing. `db push` orders and dedupes by that
version, and rejects non-numeric versions — so `20260703d_billing.sql` (letter
suffix) or `20260703_x.sql` (8 digits) will NOT work. Generate one with
`date -u +%Y%m%d%H%M%S`.

History was rebaselined on 2026-07-03 so every file here has a matching applied
row (older files had been applied out-of-band with mismatched versions). Backup
of the pre-rebaseline history: `supabase_migrations.schema_migrations_bak_20260703`.

## Base schema caveat

These migrations are **incremental changes on top of `../schema.sql`**, which is
the canonical full schema and is applied out-of-band (not as a migration — e.g.
`scripts/apply-schema.mjs`). The earliest migration here already `ALTER`s tables
that only `schema.sql` creates, so this folder is **not** self-contained: running
it against an empty database (a fresh project or a preview branch) would fail
until `schema.sql` is loaded first. Production is fine because it already has the
base schema and the rebaselined history marks everything applied.

If Supabase branching is ever enabled, add a `00000000000000_baseline.sql` that
reproduces `schema.sql` so preview branches can build from scratch.

## Workflow

1. Write `supabase/migrations/<new-timestamp>_<name>.sql` (idempotent where
   practical: `create table if not exists`, `create or replace`, `drop … if
   exists`).
2. Mirror the change into `../schema.sql` so the canonical schema stays complete.
3. Merge to `master` → the integration applies it. (Or apply directly via the
   Supabase MCP `apply_migration` during development; it records history too.)
