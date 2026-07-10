// Rotate the Instagram cookies used by the transcript pipeline — no redeploy.
//
//   node scripts/update-ig-cookies.mjs <path/to/cookies.txt> [--url https://your-app.com] [--no-test]
//
// Reads a Netscape cookies.txt export, base64-encodes it, and POSTs it to
// /api/admin/ig-cookies authenticated with CRON_SECRET (from .env.local or the
// environment). The server validates the file, live-tests it against
// IG_HEALTHCHECK_REEL_URL from Vercel's own egress IPs, and stores it in
// Supabase. See docs/ig-cookies-runbook.md for how to mint long-lived cookies.
import { existsSync, readFileSync } from "node:fs";

// Load .env.local manually (no dotenv dep) — same pattern as scripts/diag-ig.mjs.
const env = { ...process.env };
const envPath = new URL("../.env.local", import.meta.url);
if (existsSync(envPath)) {
  for (const rawLine of readFileSync(envPath, "utf8").split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) env[m[1]] = m[2].trim();
  }
}

const args = process.argv.slice(2);
const noTest = args.includes("--no-test");
const urlFlagIdx = args.indexOf("--url");
const baseUrl =
  (urlFlagIdx !== -1 ? args[urlFlagIdx + 1] : null) ??
  env.APP_BASE_URL ??
  "http://localhost:3000";
const cookiesPath = args.find(
  (a, i) => !a.startsWith("--") && (urlFlagIdx === -1 || i !== urlFlagIdx + 1)
);

if (!cookiesPath) {
  console.error(
    "Usage: node scripts/update-ig-cookies.mjs <path/to/cookies.txt> [--url https://your-app.com] [--no-test]"
  );
  process.exit(1);
}
if (!env.CRON_SECRET) {
  console.error("CRON_SECRET not found in environment or .env.local — it authenticates this script.");
  process.exit(1);
}

let cookiesText;
try {
  cookiesText = readFileSync(cookiesPath, "utf8");
} catch (e) {
  console.error(`Could not read ${cookiesPath}: ${e.message}`);
  process.exit(1);
}

const endpoint = `${baseUrl.replace(/\/$/, "")}/api/admin/ig-cookies`;
console.log(`Uploading ${cookiesPath} (${cookiesText.length} bytes) to ${endpoint} ...`);
if (noTest) console.log("Live test disabled (--no-test).");

const res = await fetch(endpoint, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${env.CRON_SECRET}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    cookies_b64: Buffer.from(cookiesText, "utf8").toString("base64"),
    live_test: !noTest,
  }),
}).catch((e) => {
  console.error(`Request failed: ${e.message}`);
  process.exit(1);
});

const body = await res.json().catch(() => ({}));

if (!res.ok) {
  console.error(`\nFAILED [HTTP ${res.status}] ${body.error ?? ""}`);
  for (const p of body.problems ?? []) console.error(`  - ${p}`);
  if (body.detail) console.error(`  detail: ${body.detail}`);
  process.exit(1);
}

console.log(`\nOK — ${body.cookieCount} cookies stored.`);
console.log(`  live-tested: ${body.liveTested ? "yes (extraction succeeded on the server)" : "no"}`);
if (body.sessionIdExpiresAt) console.log(`  sessionid nominal expiry: ${body.sessionIdExpiresAt}`);
console.log("\nThe pipeline picks the new cookies up within ~60 seconds. No redeploy needed.");
