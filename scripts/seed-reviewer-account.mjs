// P1.4 (09-platform-access.md): creates the login Meta App Review reviewers use
// to exercise the full connect -> feed -> script flow. This script ONLY creates
// the auth user (+ its auto-created profile row via the on_auth_user_created
// trigger) with a generated password — it does NOT and CANNOT connect an
// Instagram account. That step is a real Meta OAuth consent click and has to
// be done by a human (the founder) logging in as this account and pressing
// "Connect Instagram" themselves.
//
// Idempotent: re-running with the same --email rotates the password (via
// admin.auth.admin.updateUserById) instead of failing, so it's safe to use
// this to regenerate credentials before handing them to a reviewer again.
//
//   node scripts/seed-reviewer-account.mjs                          # default email
//   node scripts/seed-reviewer-account.mjs --email you@reelspy.dev  # custom email
//
// Reads Supabase service-role creds from .env.local (same pattern as
// seed-accounts.mjs / diag-ig.mjs). Prints the password ONCE to stdout —
// nothing is written to disk or to the repo. Copy it straight into the App
// Review submission notes and do not paste it anywhere else.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const emailArgIdx = process.argv.indexOf("--email");
const email =
  emailArgIdx !== -1 && process.argv[emailArgIdx + 1]
    ? process.argv[emailArgIdx + 1]
    : "meta-reviewer@reelspy.dev";

const env = {};
for (const rawLine of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const line = rawLine.replace(/\r$/, "");
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// URL-safe, no ambiguous punctuation the founder has to retype into a Meta
// review form by hand.
function generatePassword() {
  return randomBytes(18).toString("base64").replace(/[+/=]/g, "x");
}

const password = generatePassword();

const { data: list, error: listError } = await supabase.auth.admin.listUsers({ perPage: 200 });
if (listError) {
  console.error(`Failed to list users: ${listError.message}`);
  process.exit(1);
}
const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());

let userId;
if (existing) {
  const { data, error } = await supabase.auth.admin.updateUserById(existing.id, { password });
  if (error) {
    console.error(`Failed to rotate password for ${email}: ${error.message}`);
    process.exit(1);
  }
  userId = data.user.id;
  console.log(`Existing reviewer account found — rotated its password.`);
} else {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // skip the OTP flow; this login never needs to receive mail
  });
  if (error) {
    console.error(`Failed to create ${email}: ${error.message}`);
    process.exit(1);
  }
  userId = data.user.id;
  console.log(`Created reviewer account.`);
}

// The on_auth_user_created trigger inserts the profiles row; confirm it landed
// so we don't hand over a login that 500s on first dashboard render.
const { data: profile, error: profileError } = await supabase
  .from("profiles")
  .select("id")
  .eq("id", userId)
  .maybeSingle();
if (profileError || !profile) {
  console.error(
    `Warning: no profiles row found for ${userId} yet (trigger may be delayed). Check before handing off.`
  );
}

console.log("\n— Meta App Review credentials — copy into submission notes, then discard —");
console.log(`  URL:      https://app.reelspy.dev/login`);
console.log(`  Email:    ${email}`);
console.log(`  Password: ${password}`);
console.log(
  "\nNext (founder, manual): log in as this account, press \"Connect Instagram\", and " +
    "complete the Facebook consent dialog with an Instagram Business/Creator account you " +
    "control (must be linked to a Facebook Page). Then sync + generate one script so the " +
    "reviewer sees a fully populated flow, not an empty feed."
);
