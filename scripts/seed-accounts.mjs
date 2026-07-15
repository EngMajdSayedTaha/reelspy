// Seed loader: pushes the curated per-niche handle lists from
// scripts/seed-data/seed-accounts.json into the seed_accounts table, plus a stub
// row per handle in ig_account_snapshots so the enrich cron has something to
// update. Pure DB work — NO Meta calls here (enrichment/validation happens later
// in /api/cron/enrich-seeds). Idempotent: safe to re-run after editing the JSON.
//
//   node scripts/seed-accounts.mjs            # apply
//   node scripts/seed-accounts.mjs --dry-run  # print what would change
//
// Reads Supabase service-role creds from .env.local (same pattern as diag-ig.mjs).

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const DRY_RUN = process.argv.includes("--dry-run");

// Load .env.local manually (no dotenv dep). Optional under --dry-run so the data
// file can be validated offline without Supabase creds.
const env = {};
try {
  for (const rawLine of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
} catch (e) {
  if (!DRY_RUN) throw e;
}

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
let supabase = null;
if (!DRY_RUN) {
  if (!url || !serviceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }
  supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Mirror lib/trends/shared.ts slugifyNiche + snapshots.ts normalize().
const slugifyNiche = (name) => name.trim().toLowerCase().replace(/\s+/g, " ");
const normalizeHandle = (u) => u.trim().replace(/^@+/, "").toLowerCase();

const data = JSON.parse(
  readFileSync(new URL("./seed-data/seed-accounts.json", import.meta.url), "utf8")
);

// Build username -> { niche_slug, priority }. PK is ig_username, so a handle can
// only belong to ONE niche; first occurrence wins and later ones are reported.
// priority preserves the JSON order within a niche (earlier = higher) so manual
// curation carries through to ranking ties.
const byUsername = new Map();
const conflicts = [];
let totalCandidates = 0;

for (const [nicheRaw, handles] of Object.entries(data)) {
  if (nicheRaw.startsWith("_") || !Array.isArray(handles)) continue; // skip _readme etc.
  const niche_slug = slugifyNiche(nicheRaw);
  if (!niche_slug) continue;

  handles.forEach((raw, idx) => {
    const ig_username = normalizeHandle(String(raw));
    if (!ig_username) return;
    totalCandidates += 1;
    const existing = byUsername.get(ig_username);
    if (existing) {
      if (existing.niche_slug !== niche_slug) {
        conflicts.push(`${ig_username}: kept "${existing.niche_slug}", ignored "${niche_slug}"`);
      }
      return;
    }
    // priority = position from the end, so index 0 gets the highest priority.
    byUsername.set(ig_username, { ig_username, niche_slug, priority: handles.length - idx });
  });
}

const seedRows = [...byUsername.values()];
const perNiche = {};
for (const r of seedRows) perNiche[r.niche_slug] = (perNiche[r.niche_slug] ?? 0) + 1;

console.log(`Niches: ${Object.keys(perNiche).length}`);
for (const [niche, n] of Object.entries(perNiche).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${niche}: ${n}`);
}
console.log(`Candidates in file: ${totalCandidates} | unique handles: ${seedRows.length}`);
if (conflicts.length) {
  console.log(`Cross-niche duplicates (${conflicts.length}):`);
  for (const c of conflicts) console.log(`  ${c}`);
}

if (DRY_RUN) {
  console.log("\n--dry-run: no writes performed.");
  process.exit(0);
}

// Chunked upserts to stay under payload limits.
const CHUNK = 500;
async function upsertChunks(table, rows, options) {
  let written = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK);
    const { error } = await supabase.from(table).upsert(batch, options);
    if (error) {
      console.error(`\n${table} upsert failed at row ${i}: ${error.message}`);
      process.exit(1);
    }
    written += batch.length;
    process.stdout.write(`\r${table}: ${written}/${rows.length}`);
  }
  process.stdout.write("\n");
}

// 1. seed_accounts (the niche -> handle intent table).
await upsertChunks("seed_accounts", seedRows, { onConflict: "ig_username" });

// 2. ig_account_snapshots stub rows so the enrich cron has a row to update and
// the freshness check works. ignoreDuplicates so we never clobber already-cached
// accounts (their real metrics / status stay intact).
const stubRows = seedRows.map((r) => ({ ig_username: r.ig_username }));
await upsertChunks("ig_account_snapshots", stubRows, {
  onConflict: "ig_username",
  ignoreDuplicates: true,
});

console.log("\nDone. Run /api/cron/enrich-seeds (repeatedly) to validate + enrich via Meta.");
process.exit(0);
