import fs from "node:fs";
import path from "node:path";

const envPath = path.join(process.cwd(), ".env.local");

const requiredKeys = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SITE_URL",
];

const requiredTables = [
  "profiles",
  "inspiration_accounts",
  "tracked_reels",
  "generated_scripts",
];

const recommendedKeys = [
  "META_APP_ID",
  "META_APP_SECRET",
  "META_REDIRECT_URI",
  "ANTHROPIC_API_KEY",
];

function parseEnvFile(content) {
  const values = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const equalsIndex = line.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }
    const key = line.slice(0, equalsIndex).trim();
    const value = line.slice(equalsIndex + 1).trim();
    values[key] = value;
  }
  return values;
}

async function checkTableExists({ supabaseUrl, anonKey, table }) {
  const url = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/${table}?select=*&limit=1`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
  });

  if (response.ok) {
    return { exists: true };
  }

  const body = await response.text();
  return {
    exists: false,
    status: response.status,
    body,
  };
}

if (!fs.existsSync(envPath)) {
  console.error("[ERROR] .env.local was not found.");
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, "utf8");
const envValues = parseEnvFile(envContent);

const missing = requiredKeys.filter((key) => !envValues[key]);

if (missing.length > 0) {
  console.error("[ERROR] Missing required auth setup values:");
  for (const key of missing) {
    console.error(`- ${key}`);
  }
  process.exit(1);
}

const appUrl = envValues.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");

console.log("[OK] Required local auth env values are present.");

const missingTables = [];

for (const table of requiredTables) {
  try {
    const result = await checkTableExists({
      supabaseUrl: envValues.NEXT_PUBLIC_SUPABASE_URL,
      anonKey: envValues.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      table,
    });

    if (!result.exists) {
      missingTables.push({
        table,
        status: result.status,
        body: result.body,
      });
    }
  } catch (error) {
    console.error(`[ERROR] Could not validate Supabase table \"${table}\".`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (missingTables.length > 0) {
  console.error("[ERROR] Supabase schema appears incomplete. Missing/unavailable tables:");
  for (const entry of missingTables) {
    console.error(`- ${entry.table} (HTTP ${entry.status})`);
  }
  console.error("Run supabase/schema.sql in Supabase SQL Editor, then re-run npm run check:auth-setup.");
  process.exit(1);
}

console.log("[OK] Supabase schema tables are reachable.");

const missingRecommended = recommendedKeys.filter((key) => !envValues[key]);
if (missingRecommended.length > 0) {
  console.warn("[WARN] Optional production integrations are not fully configured:");
  for (const key of missingRecommended) {
    console.warn(`- ${key}`);
  }
}

console.log("Next steps checklist:");
console.log(`1. Supabase Auth -> URL Configuration -> Site URL = ${appUrl}`);
console.log(`2. Supabase Auth -> URL Configuration -> Redirect URL includes ${appUrl}/auth/callback`);
console.log("3. Supabase Auth -> Providers -> Google is enabled with client ID/secret.");
console.log("4. Google Cloud OAuth client includes Supabase auth callback URI from dashboard.");
