// Does production actually have the schema the code expects?
//
// WHY THIS EXISTS
// ---------------
// Migrations are applied by the GitHub ↔ Supabase integration when master is
// merged (supabase/migrations/README.md). Nothing verifies that it happened.
// On 2026-08-04 four merged migrations had silently never been applied, and the
// failure was invisible for a different reason in each case:
//
//   account_archives          the archive job read "relation does not exist" as
//                             "no archive yet", so every pass restarted the walk
//                             from page 1 — re-fetching the same reels hourly
//                             out of the shared Meta budget, reporting `done`
//                             each time, and never reaching the completion that
//                             delivers reels to the user's feed.
//   publish_jobs_platform_    scheduling a post INSERTed a column that wasn't
//   options                   there, so publishing was broken outright.
//   profiles_fb_user_id       Meta's deauthorize / data-deletion callbacks could
//                             no longer resolve a user — an App Review
//                             requirement, degrading silently by design.
//   scheduled_plan_changes    deferred plan changes had nowhere to be cached.
//
// The common thread is that a missing column produces an ERROR OBJECT, not a
// crash, and this codebase (correctly) tolerates many of those. So drift has to
// be checked directly rather than waited for.
//
// The probe goes through PostgREST with the service-role key — the same path the
// app uses. That is deliberate: if the running app cannot see a column, neither
// can this script, so a pass here means the app is genuinely unblocked.
//
// Usage:
//   npm run check:schema
//
// Reads NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from .env.local, or
// the real environment when they're already exported. Exits non-zero on drift,
// so it can gate a deploy.

import fs from "node:fs";
import path from "node:path";

function parseEnvFile(content) {
  const values = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    values[line.slice(0, eq).trim()] = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
  return values;
}

function loadEnv() {
  const file = path.join(process.cwd(), ".env.local");
  const fromFile = fs.existsSync(file) ? parseEnvFile(fs.readFileSync(file, "utf8")) : {};
  return { ...fromFile, ...process.env };
}

// What the migration folder CLAIMS production should have. Parsed from the SQL
// rather than hand-listed so a new migration is covered the day it lands — a
// checklist nobody updates is the same blind spot one layer up.
function expectedSchema(dir) {
  const tables = new Map(); // table -> Set(columns)
  const need = (table) => {
    if (!tables.has(table)) tables.set(table, new Set());
    return tables.get(table);
  };

  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    // Strip comments first: these files carry long `--` rationale blocks, and
    // the words "add column" appear in plenty of them.
    const sql = fs
      .readFileSync(path.join(dir, file), "utf8")
      .replace(/--[^\n]*/g, "")
      .replace(/\s+/g, " ");

    for (const m of sql.matchAll(/create table if not exists ([a-z0-9_."]+)/gi)) {
      need(clean(m[1]));
    }

    // `alter table X add column if not exists a ..., add column if not exists b`
    for (const m of sql.matchAll(/alter table (?:only )?([a-z0-9_."]+)(.*?);/gi)) {
      const table = clean(m[1]);
      for (const c of m[2].matchAll(/add column if not exists ([a-z0-9_]+)/gi)) {
        need(table).add(c[1]);
      }
      // A feature that was added and later removed must not read as drift: the
      // folder is a HISTORY, not a description of the current shape. Files are
      // walked in version order, so replaying drops as they appear leaves
      // exactly what the last migration intends.
      for (const c of m[2].matchAll(/drop column if exists ([a-z0-9_]+)/gi)) {
        tables.get(table)?.delete(c[1]);
      }
    }

    for (const m of sql.matchAll(/drop table if exists ([a-z0-9_."]+)/gi)) {
      tables.delete(clean(m[1]));
    }
  }
  return tables;
}

function clean(identifier) {
  return identifier.replace(/"/g, "").replace(/^public\./, "");
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const key = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("[ERROR] NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing.");
  process.exit(2);
}

const migrationsDir = path.join(process.cwd(), "supabase", "migrations");
if (!fs.existsSync(migrationsDir)) {
  console.error(`[ERROR] No migrations directory at ${migrationsDir}.`);
  process.exit(2);
}

const expected = expectedSchema(migrationsDir);
console.log(`Checking ${expected.size} tables against ${url}\n`);

const problems = [];

for (const [table, columns] of [...expected].sort(([a], [b]) => a.localeCompare(b))) {
  // limit=0 asks PostgREST to resolve the projection without returning rows, so
  // the answer is purely "does this shape exist".
  const select = columns.size > 0 ? [...columns].join(",") : "*";
  const response = await fetch(
    `${url}/rest/v1/${table}?select=${encodeURIComponent(select)}&limit=0`,
    { headers: { apikey: key, authorization: `Bearer ${key}` } }
  );

  if (response.ok) {
    console.log(`  ok    ${table}${columns.size ? ` (${columns.size} cols)` : ""}`);
    continue;
  }

  const body = await response.json().catch(() => ({}));
  const detail = body.message || body.hint || `HTTP ${response.status}`;
  // 42P01 = missing table, 42703 = missing column. Anything else (permissions,
  // network) is reported too rather than silently counted as a pass.
  console.log(`  DRIFT ${table} — ${detail}`);
  problems.push({ table, detail, code: body.code });
}

if (problems.length === 0) {
  console.log("\nNo drift. Production matches supabase/migrations.");
  process.exit(0);
}

console.log(`\n${problems.length} table(s) drifted from supabase/migrations:\n`);
for (const p of problems) console.log(`  - ${p.table}: ${p.detail}`);
console.log(
  "\nThe GitHub ↔ Supabase integration applies these on merge to master. If it\n" +
    "has stopped, re-run it or apply the missing files via the Supabase MCP\n" +
    "(apply_migration) — every migration here is written to be idempotent."
);
process.exit(1);
