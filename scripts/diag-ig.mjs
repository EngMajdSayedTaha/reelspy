// One-off diagnostic: tests the real Instagram Business Discovery flow with the stored token.
// Reads token from Supabase via service role. Does NOT print the token.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

// Load .env.local manually (no dotenv dep)
const env = {};
for (const rawLine of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const line = rawLine.replace(/\r$/, "");
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
console.log("Loaded env keys:", Object.keys(env).join(", "));

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data: profiles, error } = await supabase
  .from("profiles")
  .select("id, username, ig_user_id, ig_access_token")
  .not("ig_access_token", "is", null);

if (error) {
  console.error("DB error:", error.message);
  process.exit(1);
}

if (!profiles?.length) {
  console.log("No profiles with an IG token found.");
  process.exit(0);
}

const p = profiles[0];
console.log(`Profile: ${p.username} | ig_user_id: ${p.ig_user_id} | token length: ${p.ig_access_token.length}`);

const token = p.ig_access_token;
const igUserId = p.ig_user_id;

// Get target username from inspiration_accounts
const { data: accounts } = await supabase
  .from("inspiration_accounts")
  .select("ig_username")
  .eq("user_id", p.id)
  .eq("is_active", true);

const target = accounts?.[0]?.ig_username;
console.log(`Inspiration accounts: ${(accounts ?? []).map((a) => a.ig_username).join(", ") || "(none)"}`);

async function hit(label, url) {
  try {
    const res = await fetch(url, { cache: "no-store" });
    const text = await res.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    console.log(`\n=== ${label} === [HTTP ${res.status}]`);
    console.log(JSON.stringify(parsed, null, 2).slice(0, 1500));
    return { ok: res.ok, parsed };
  } catch (e) {
    console.log(`\n=== ${label} === ERROR: ${e.message}`);
    return { ok: false };
  }
}

// 1. Is this a Facebook user token? List linked Pages + IG business account.
await hit(
  "FB PAGES + IG BUSINESS ACCOUNT (graph.facebook.com/me/accounts)",
  `https://graph.facebook.com/v23.0/me/accounts?fields=${encodeURIComponent(
    "name,instagram_business_account{id,username,profile_picture_url}"
  )}&access_token=${token}`
);

if (target) {
  // 2. Business Discovery via Facebook Login (the NEW correct path).
  await hit(
    "BUSINESS DISCOVERY (graph.facebook.com .username syntax)",
    `https://graph.facebook.com/v23.0/${igUserId}?fields=${encodeURIComponent(
      `business_discovery.username(${target}){username,followers_count,media_count,media.limit(5){id,caption,media_type,media_product_type,like_count,comments_count,permalink,timestamp,thumbnail_url}}`
    )}&access_token=${token}`
  );
}

process.exit(0);
