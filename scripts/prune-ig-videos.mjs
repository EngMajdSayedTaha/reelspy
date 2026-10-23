#!/usr/bin/env node
// One-off cleanup for the `ig-media` bucket: deletes mirrored reel videos older
// than N days (default 21, the public wall's lookback) and clears the
// ig_reel_snapshots.video_url values that pointed at them.
//
//   node scripts/prune-ig-videos.mjs [--days 21] [--apply]
//
// DRY RUN BY DEFAULT: without --apply it only lists what would be deleted and
// how much space that frees. Needs NEXT_PUBLIC_SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY (read from .env.local or the environment).
//
// Deletes go through the Storage API on purpose — removing rows from
// storage.objects with SQL leaves the files behind and frees no quota.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUCKET = "ig-media";
const PAGE = 100;

// Minimal .env.local reader (no dotenv dependency, matching the other scripts).
function loadEnv() {
  let raw = "";
  try {
    raw = readFileSync(join(ROOT, ".env.local"), "utf8");
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2].trim();
    if (/^".*"$/.test(value) || /^'.*'$/.test(value)) value = value.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = value;
  }
}

loadEnv();

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const daysIdx = args.indexOf("--days");
const days = daysIdx >= 0 ? Number(args[daysIdx + 1]) : 21;
if (!Number.isFinite(days) || days < 0) {
  console.error("--days must be a non-negative number");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });
const bucket = admin.storage.from(BUCKET);
const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

// Oldest-first, so everything stale is a prefix of the listing.
const stale = [];
for (let offset = 0; ; offset += PAGE) {
  const { data, error } = await bucket.list("videos", {
    limit: PAGE,
    offset,
    sortBy: { column: "created_at", order: "asc" },
  });
  if (error) {
    console.error("list failed:", error.message);
    process.exit(1);
  }
  if (!data || data.length === 0) break;
  const old = data.filter(
    (f) => f.name.endsWith(".mp4") && f.created_at && Date.parse(f.created_at) < cutoff
  );
  stale.push(...old);
  if (old.length < data.length) break;
}

const bytes = stale.reduce((n, f) => n + (f.metadata?.size ?? 0), 0);
console.log(
  `${stale.length} video(s) older than ${days} days, ${(bytes / 1024 / 1024).toFixed(0)} MB.`
);
if (stale.length === 0) process.exit(0);

if (!apply) {
  for (const f of stale) console.log(`  videos/${f.name}  ${f.created_at}`);
  console.log("\nDry run. Re-run with --apply to delete them.");
  process.exit(0);
}

for (let i = 0; i < stale.length; i += PAGE) {
  const paths = stale.slice(i, i + PAGE).map((f) => `videos/${f.name}`);
  const urls = paths.map((p) => bucket.getPublicUrl(p).data.publicUrl);

  // Clear the pointers first: a failed delete is just retried, whereas the
  // reverse order could leave a row pointing at a file that no longer exists.
  const { error: clearError } = await admin
    .from("ig_reel_snapshots")
    .update({ video_url: null })
    .in("video_url", urls);
  if (clearError) {
    console.error("clearing video_url failed:", clearError.message);
    process.exit(1);
  }
  const { error: removeError } = await bucket.remove(paths);
  if (removeError) {
    console.error("remove failed:", removeError.message);
    process.exit(1);
  }
  console.log(`Deleted ${Math.min(i + PAGE, stale.length)}/${stale.length}`);
}
console.log("Done.");
