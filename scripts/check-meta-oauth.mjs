// Pre-flight for the Meta OAuth handshake.
//
// WHY THIS EXISTS
// ---------------
// When the redirect URI the app sends isn't registered in the Meta app's Client
// OAuth Settings, Facebook answers the consent dialog with a dead-end page:
//
//     URL Blocked
//     This redirect failed because the redirect URI is not whitelisted in the
//     app's Client OAuth Settings.
//
// It is a DEAD END in the strict sense — Facebook never redirects back, so the
// app's callback is never hit, nothing is logged server-side, and the database
// simply shows no new connections. That is how this went unnoticed from
// 2026-07-25 (the app.reelspy.dev migration) until it was reported: the last
// successful connect was 2026-07-23, and the only visible symptom was "connect
// doesn't work".
//
// This script reproduces the handshake WITHOUT a browser and reports the
// verdict, so the config can be verified in seconds after any domain change
// instead of being discovered by a user weeks later.
//
// Usage:
//   npm run check:meta
//   npm run check:meta -- --redirect-uri https://app.reelspy.dev/api/ig/callback
//
// Reads META_APP_ID / META_FB_CONFIG_ID / META_REDIRECT_URI / NEXT_PUBLIC_SITE_URL
// from .env.local, or the real environment when they're already exported.

import fs from "node:fs";
import path from "node:path";

const GRAPH_VERSION = "v23.0";
const DEFAULT_SITE_URL = "https://app.reelspy.dev";

function parseEnvFile(content) {
  const values = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    values[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return values;
}

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  const fromFile = fs.existsSync(envPath)
    ? parseEnvFile(fs.readFileSync(envPath, "utf8"))
    : {};
  return { ...fromFile, ...process.env };
}

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

function buildAuthorizeUrl({ appId, redirectUri, configId, scopes }) {
  const url = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", "preflight");
  if (configId) url.searchParams.set("config_id", configId);
  else url.searchParams.set("scope", scopes);
  return url.toString();
}

async function main() {
  const env = loadEnv();

  const appId = env.META_APP_ID;
  const appSecret = env.META_APP_SECRET;
  const configId = env.META_FB_CONFIG_ID?.trim() || undefined;
  const siteUrl = (env.NEXT_PUBLIC_SITE_URL?.trim() || DEFAULT_SITE_URL).replace(/\/+$/, "");
  const redirectUri =
    argValue("--redirect-uri") ||
    env.META_REDIRECT_URI?.trim() ||
    `${siteUrl}/api/ig/callback`;
  const scopes = env.META_IG_SCOPES?.trim() || "instagram_basic,pages_show_list";

  console.log("Meta OAuth pre-flight\n");
  console.log(`  App ID          ${appId || "(not set)"}`);
  console.log(`  App secret      ${appSecret ? "set" : "(not set)"}`);
  console.log(`  Login flow      ${configId ? `Facebook Login for Business (config_id ${configId})` : "classic Facebook Login (scope)"}`);
  console.log(`  Redirect URI    ${redirectUri}`);
  console.log("");

  if (!appId) {
    console.error("FAIL  META_APP_ID is not set — the dialog cannot even be built.");
    process.exit(1);
  }
  if (!appSecret) {
    console.warn("WARN  META_APP_SECRET is not set — the token exchange would fail later.\n");
  }

  const authorizeUrl = buildAuthorizeUrl({ appId, redirectUri, configId, scopes });

  let response;
  let body = "";
  try {
    // No redirect following: a healthy dialog answers 200 (login/consent) or
    // 302 to a Facebook login page. The URL-Blocked error is served as 200 HTML
    // and is checked below by content, since Facebook does not give it a
    // distinct status code.
    response = await fetch(authorizeUrl, {
      redirect: "manual",
      headers: {
        // A browser-ish UA: Facebook serves a stripped page to obvious bots.
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        "accept-language": "en-US,en;q=0.9",
      },
    });
    body = await response.text();
  } catch (error) {
    console.error(`FAIL  Could not reach Facebook: ${error.message}`);
    console.error("      (A blocked network or proxy will produce this too — it is not\n" +
                  "       by itself proof that the app config is wrong.)");
    process.exit(1);
  }

  const blocked = /URL Blocked/i.test(body) || /not whitelisted/i.test(body);
  const misconfigured = /Invalid App ID|app_id.*invalid/i.test(body);
  const notActive = /App Not Active|not currently accessible/i.test(body);

  if (blocked) {
    const origin = new URL(redirectUri).origin;
    console.error("FAIL  Facebook answered “URL Blocked”.\n");
    console.error("      The redirect URI below is NOT in the Meta app's Valid OAuth");
    console.error("      Redirect URIs. Facebook rejects the handshake before the user can");
    console.error("      authorize, never redirects back, and the app's callback is never");
    console.error("      reached — so nothing appears in the server logs.\n");
    console.error(`      Add this EXACT string (no trailing slash, https, case-sensitive):\n`);
    console.error(`          ${redirectUri}\n`);
    console.error(`      Meta app dashboard → ${configId ? "Facebook Login for Business" : "Facebook Login"} → Settings →`);
    console.error(`      Client OAuth Settings → Valid OAuth Redirect URIs.\n`);
    console.error(`      Adding it under “Instagram business login” is NOT the same field and`);
    console.error(`      will not fix this — the app authorizes through Facebook Login.\n`);
    console.error(`      While you are there: Client OAuth Login and Web OAuth Login must both`);
    console.error(`      be ON, and ${origin} should be listed under App Domains.`);
    process.exit(1);
  }

  if (misconfigured) {
    console.error("FAIL  Facebook rejected the App ID. Check META_APP_ID.");
    process.exit(1);
  }

  if (notActive) {
    console.error("FAIL  Facebook says the app is not active.\n");
    console.error("      The app is in Development mode and the Facebook account you sign in");
    console.error("      with has no role on it. Add that account under App Roles →");
    console.error("      Roles (Admin/Developer/Tester), or switch the app to Live.");
    process.exit(1);
  }

  console.log("PASS  Facebook accepted the redirect URI — no “URL Blocked”.");
  console.log(`      (HTTP ${response.status}; Facebook is now asking the user to log in or consent.)`);
  console.log("\n      This checks the handshake only. It cannot verify permissions,");
  console.log("      app-review state, or whether the signed-in account has a role while");
  console.log("      the app is in Development mode.");
}

main().catch((error) => {
  console.error(`FAIL  ${error.message}`);
  process.exit(1);
});
