// Clears the stale IG token from all profiles so a clean reconnect can happen.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = {};
for (const rawLine of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const line = rawLine.replace(/\r$/, "");
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data, error } = await supabase
  .from("profiles")
  .update({ ig_access_token: null, ig_user_id: null })
  .not("ig_access_token", "is", null)
  .select("id");

if (error) {
  console.error("Failed:", error.message);
  process.exit(1);
}

console.log(`Cleared stale token from ${data?.length ?? 0} profile(s).`);
process.exit(0);
