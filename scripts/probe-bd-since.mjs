// Probe: does business_discovery's nested `media` edge honor `.since(<unix>)`?
//
// `since`/`until` are documented on the IG User /media edge. They are NOT
// documented on the nested business_discovery media edge, and Meta's Graph API
// silently IGNORES unknown edge params rather than erroring — so "it didn't
// throw" proves nothing. This asks the only question that matters: with a cutoff
// set to ~90 days ago, does Meta stop returning older media, or hand back the
// same newest-first page it would have anyway?
//
// Why it matters: the archive pull walks backwards until it crosses a date
// cutoff. If `since` works, Meta stops for us and we skip fetching the pages
// we'd discard. If it doesn't, we fetch one boundary page and filter locally —
// same result, one extra call per archive. Pure optimization either way.
//
// Reads .env.local + a stored token via the service role, like scripts/diag-ig.mjs.
// Does NOT print the token.
//
//   node scripts/probe-bd-since.mjs [username]

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

// .env.local normally sits at the repo root, but this also runs from a git
// worktree under .claude/worktrees/<name>/, which doesn't carry one. Try the
// obvious places, and let ENV_FILE settle it anywhere else.
function loadEnv() {
  const candidates = [
    process.env.ENV_FILE,
    new URL("../.env.local", import.meta.url),
    new URL("../../../../.env.local", import.meta.url), // worktree → main checkout
  ].filter(Boolean);

  for (const candidate of candidates) {
    let raw;
    try {
      raw = readFileSync(candidate, "utf8");
    } catch {
      continue;
    }
    const parsed = {};
    for (const rawLine of raw.split("\n")) {
      const m = rawLine.replace(/\r$/, "").match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) parsed[m[1]] = m[2].trim();
    }
    console.log(`env: ${candidate.pathname ?? candidate}`);
    return parsed;
  }

  console.error("No .env.local found. Pass one: ENV_FILE=/path/to/.env.local node scripts/probe-bd-since.mjs");
  process.exit(1);
}

const env = loadEnv();

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data: profiles, error } = await supabase
  .from("profiles")
  .select("id, username, ig_user_id, ig_access_token")
  .eq("ig_token_status", "active")
  .not("ig_access_token", "is", null)
  .limit(1);

if (error) {
  console.error("DB error:", error.message);
  process.exit(1);
}
if (!profiles?.length) {
  console.error("No profile with an active IG token. Connect Instagram first.");
  process.exit(1);
}

const { id: userId, ig_user_id: igUserId, ig_access_token: token } = profiles[0];

// Target: CLI arg, else the caller's first tracked account.
let target = process.argv[2]?.replace(/^@+/, "").toLowerCase();
if (!target) {
  const { data: accounts } = await supabase
    .from("inspiration_accounts")
    .select("ig_username")
    .eq("user_id", userId)
    .eq("is_active", true)
    .limit(1);
  target = accounts?.[0]?.ig_username;
}
if (!target) {
  console.error("No target account. Pass one: node scripts/probe-bd-since.mjs nike");
  process.exit(1);
}

const MEDIA_FIELDS = "id,timestamp,media_type,media_product_type";
const PAGE = 25;
const cutoff = Math.floor(Date.now() / 1000) - 90 * 24 * 3600;

async function fetchMedia(label, mediaArgs) {
  const fields = `business_discovery.username(${target}){username,${mediaArgs}{${MEDIA_FIELDS}}}`;
  const url = `https://graph.facebook.com/v23.0/${igUserId}?fields=${encodeURIComponent(
    fields
  )}&access_token=${token}`;

  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    console.log(`\n=== ${label} === [HTTP ${res.status}] unparseable body:\n${text.slice(0, 500)}`);
    return null;
  }

  if (!res.ok || json.error) {
    console.log(`\n=== ${label} === [HTTP ${res.status}] ERROR`);
    console.log(JSON.stringify(json.error ?? json, null, 2).slice(0, 800));
    return null;
  }

  const items = json.business_discovery?.media?.data ?? [];
  const stamps = items.map((i) => i.timestamp).filter(Boolean).sort();
  console.log(`\n=== ${label} === [HTTP ${res.status}]`);
  console.log(`items: ${items.length}`);
  if (stamps.length) {
    console.log(`newest: ${stamps[stamps.length - 1]}`);
    console.log(`oldest: ${stamps[0]}`);
  }
  return { items, oldest: stamps[0], newest: stamps[stamps.length - 1] };
}

console.log(`Target: @${target}`);
console.log(`Cutoff: ${new Date(cutoff * 1000).toISOString()} (90 days ago)\n`);

const baseline = await fetchMedia("BASELINE (no since)", `media.limit(${PAGE})`);
const withSince = await fetchMedia(`WITH .since(${cutoff})`, `media.limit(${PAGE}).since(${cutoff})`);

console.log("\n──────────── VERDICT ────────────");

if (!baseline || !withSince) {
  console.log("INCONCLUSIVE — a call failed. See the error above.");
  console.log("If .since() itself errored, treat it as UNSUPPORTED: keep the client-side cutoff.");
  process.exit(0);
}

const baselineCrossed = baseline.oldest && baseline.oldest < new Date(cutoff * 1000).toISOString();

if (!baselineCrossed) {
  console.log("INCONCLUSIVE — the first page of this account doesn't reach past the cutoff,");
  console.log("so both calls SHOULD look identical. Re-run against an account that posts less");
  console.log("often, or widen the cutoff, before trusting either answer.");
  process.exit(0);
}

const sinceCrossed =
  withSince.oldest && withSince.oldest < new Date(cutoff * 1000).toISOString();

if (sinceCrossed) {
  console.log("UNSUPPORTED — .since() was ignored: media older than the cutoff still came back.");
  console.log("→ Keep the client-side cutoff (ReelsPageResult.oldestPostedAt). Do not pass `since`.");
} else {
  console.log("SUPPORTED — .since() truncated the page at the cutoff.");
  console.log("→ Safe for the archive job to pass `since` and skip pages it would discard.");
  console.log("  Re-verify on a version bump; this is undocumented behavior.");
}
