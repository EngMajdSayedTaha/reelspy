#!/usr/bin/env node
// The out-of-band half of admin step-up authentication.
//
// The control panel asks for an admin passphrase on top of `profiles.is_admin`
// (see docs/admin-security.md). That passphrase cannot be set from inside the
// browser session it is meant to protect — otherwise anyone who stole the
// session would set it themselves and the second factor would be worth nothing.
// So enrolling, resetting and unlocking happen HERE, from a machine that holds
// the Supabase service-role key: proof of access to the infrastructure, not
// merely to a logged-in tab.
//
//   npm run admin:passphrase -- status  --email you@example.com
//   npm run admin:passphrase -- invite  --email you@example.com [--ttl 30]
//   npm run admin:passphrase -- set     --email you@example.com
//   npm run admin:passphrase -- unlock  --email you@example.com
//   npm run admin:passphrase -- revoke  --email you@example.com
//
//   status   what the account currently has: admin flag, passphrase, lockout,
//            live elevated sessions.
//   invite   mint a one-time enrollment code (default 30 min) to redeem at
//            /admin/setup. The normal first-run and "I forgot it" path.
//   set      write a passphrase directly, prompted twice and never echoed. Use
//            when you can't reach the browser flow at all.
//   unlock   clear a brute-force lockout without touching the passphrase.
//   revoke   end every elevated session for the account, everywhere.
//
// Reads NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from .env.local or
// the ambient environment, like the other scripts here.

import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

// ── Crypto: must stay byte-compatible with lib/admin/passphrase.ts and
// lib/admin/token.ts. test/admin/cli-passphrase.test.ts asserts that a hash
// written here verifies there, so a drift breaks CI rather than production.
const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const MAX_MEM = 96 * 1024 * 1024;
const TICKET_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function scrypt(password, salt, keylen, options) {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keylen, options, (error, derivedKey) =>
      error ? reject(error) : resolve(derivedKey)
    );
  });
}

export async function hashPassphrase(passphrase) {
  const salt = randomBytes(16);
  const derived = await scrypt(passphrase.normalize("NFKC"), salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: MAX_MEM,
  });
  return ["scrypt", SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString("base64"), derived.toString("base64")].join("$");
}

export function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function randomEnrollmentTicket() {
  const bytes = randomBytes(20);
  const chars = Array.from(bytes, (byte) => TICKET_ALPHABET[byte % TICKET_ALPHABET.length]);
  return [0, 5, 10, 15].map((i) => chars.slice(i, i + 5).join("")).join("-");
}

// The same policy the app enforces, restated for the `set` path so a passphrase
// written from the terminal can't be weaker than one chosen in the UI. Kept
// short on purpose: lib/admin/passphrase-policy.ts is the authority, and this
// is the one place that can't import it (plain .mjs, no bundler).
function policyProblems(passphrase) {
  const problems = [];
  const value = passphrase.normalize("NFKC");
  if (value.length < 14) problems.push("Use at least 14 characters.");
  if (value.length < 24) {
    const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(value)).length;
    if (classes < 3) problems.push("Mix at least three of: lowercase, uppercase, digits, symbols — or use 24+ characters.");
  }
  if (/admin|password|reelspy|qwerty|123456/i.test(value)) {
    problems.push('Don\'t build it around an obvious word like "admin" or the product name.');
  }
  if (new Set(value).size < 5) problems.push("Too repetitive — use more distinct characters.");
  return problems;
}

// ── Environment ────────────────────────────────────────────────────────────
function loadEnv() {
  const env = {};
  try {
    for (const rawLine of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
      const match = rawLine.replace(/\r$/, "").match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (match) env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    // No .env.local — fall through to the ambient environment.
  }
  return { ...env, ...process.env };
}

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 ? process.argv[index + 1] : undefined;
}

// Prompt without echoing. Raw mode hides the keystrokes; the fallback (a piped
// stdin, e.g. CI) just reads the line, which is fine because there is no
// terminal to leak it to.
function promptSecret(question) {
  return new Promise((resolve) => {
    const input = process.stdin;
    const output = process.stdout;
    if (!input.isTTY) {
      const rl = createInterface({ input, output: undefined });
      rl.question("", (answer) => {
        rl.close();
        resolve(answer);
      });
      return;
    }
    output.write(question);
    const rl = createInterface({ input, output, terminal: true });
    const onData = (char) => {
      // Repaint the prompt without the typed characters.
      const text = String(char);
      if (text === "\n" || text === "\r" || text === "") {
        input.removeListener("data", onData);
        return;
      }
      output.write(`\r\x1b[2K${question}`);
    };
    input.on("data", onData);
    rl.question("", (answer) => {
      input.removeListener("data", onData);
      rl.close();
      output.write("\n");
      resolve(answer);
    });
  });
}

async function resolveAdmin(supabase, email, userId) {
  if (userId) return userId;
  if (!email) fail("Pass --email you@example.com (or --user-id <uuid>).");

  // listUsers is paginated; walk until the address turns up. Small tenant, so
  // this stays cheap, and it avoids depending on an admin filter API.
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) fail(`Could not list users: ${error.message}`);
    const match = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (match) return match.id;
    if (data.users.length < 200) break;
  }
  fail(`No account found for ${email}.`);
}

function fail(message) {
  console.error(`\n  ✖ ${message}\n`);
  process.exit(1);
}

async function requireAdminFlag(supabase, userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();
  if (error) fail(`Could not read the profile: ${error.message}`);
  if (!data) fail("That account has no profile row.");
  if (data.is_admin !== true) {
    // Refusing here is deliberate: a passphrase on a non-admin account is dead
    // weight that looks like access, and granting the flag is a separate,
    // audited decision made in the panel.
    fail("That account is not an admin (profiles.is_admin is false). Grant admin access first.");
  }
}

// ── Commands ───────────────────────────────────────────────────────────────
async function status(supabase, userId) {
  const [{ data: credential }, { data: sessions }] = await Promise.all([
    supabase.from("admin_credentials").select("*").eq("user_id", userId).maybeSingle(),
    supabase
      .from("admin_sessions")
      .select("id, created_at, last_seen_at, expires_at, ip, user_agent")
      .eq("admin_id", userId)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString()),
  ]);

  const locked =
    credential?.locked_until && new Date(credential.locked_until) > new Date()
      ? `LOCKED until ${credential.locked_until}`
      : "no";

  console.log(`
  Account            ${userId}
  Passphrase set     ${credential?.passphrase_hash ? `yes (${credential.passphrase_set_at ?? "unknown date"})` : "NO"}
  Pending invite     ${credential?.enrollment_hash ? `yes, expires ${credential.enrollment_expires_at}` : "no"}
  Failed attempts    ${credential?.failed_attempts ?? 0}
  Locked out         ${locked}
  Live elevations    ${sessions?.length ?? 0}`);

  for (const session of sessions ?? []) {
    console.log(`    · ${session.ip ?? "unknown ip"} — last seen ${session.last_seen_at}, expires ${session.expires_at}`);
  }
  console.log("");
}

async function invite(supabase, userId, ttlMinutes) {
  const ticket = randomEnrollmentTicket();
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000).toISOString();
  const { error } = await supabase.from("admin_credentials").upsert(
    {
      user_id: userId,
      enrollment_hash: sha256Hex(ticket),
      enrollment_expires_at: expiresAt,
      enrollment_created_at: new Date().toISOString(),
      failed_attempts: 0,
      locked_until: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (error) fail(`Could not store the enrollment code: ${error.message}`);

  console.log(`
  Enrollment code    ${ticket}
  Valid until        ${expiresAt}  (${ttlMinutes} min)

  Open /admin/setup while signed in as this account and paste the code.
  It works exactly once. Nobody can read it back out of the database — only
  its hash is stored — so if it's lost, mint another.
`);
}

async function set(supabase, userId) {
  const first = await promptSecret("  New admin passphrase: ");
  const problems = policyProblems(first);
  if (problems.length > 0) fail(`Passphrase rejected:\n    - ${problems.join("\n    - ")}`);
  const second = await promptSecret("  Repeat it: ");
  if (first !== second) fail("The two entries don't match.");

  const now = new Date().toISOString();
  const { error } = await supabase.from("admin_credentials").upsert(
    {
      user_id: userId,
      passphrase_hash: await hashPassphrase(first),
      passphrase_set_at: now,
      failed_attempts: 0,
      last_failed_at: null,
      locked_until: null,
      enrollment_hash: null,
      enrollment_expires_at: null,
      enrollment_created_at: null,
      updated_at: now,
    },
    { onConflict: "user_id" }
  );
  if (error) fail(`Could not store the passphrase: ${error.message}`);

  // A new passphrase means every existing elevation was granted under the old
  // one — end them.
  const { count } = await supabase
    .from("admin_sessions")
    .update({ revoked_at: now, revoked_reason: "passphrase_set_cli" }, { count: "exact" })
    .eq("admin_id", userId)
    .is("revoked_at", null);

  console.log(`\n  ✔ Passphrase set. ${count ?? 0} elevated session(s) revoked.\n`);
}

async function unlock(supabase, userId) {
  const { error } = await supabase
    .from("admin_credentials")
    .update({ failed_attempts: 0, last_failed_at: null, locked_until: null, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (error) fail(`Could not clear the lockout: ${error.message}`);
  console.log("\n  ✔ Lockout cleared.\n");
}

async function revoke(supabase, userId) {
  const { count, error } = await supabase
    .from("admin_sessions")
    .update(
      { revoked_at: new Date().toISOString(), revoked_reason: "revoked_cli" },
      { count: "exact" }
    )
    .eq("admin_id", userId)
    .is("revoked_at", null);
  if (error) fail(`Could not revoke sessions: ${error.message}`);
  console.log(`\n  ✔ ${count ?? 0} elevated session(s) revoked.\n`);
}

async function main() {
  const command = process.argv[2];
  const commands = ["status", "invite", "set", "unlock", "revoke"];
  if (!commands.includes(command)) {
    console.error(`
  Usage: npm run admin:passphrase -- <${commands.join("|")}> --email you@example.com

    status   show enrollment, lockout and live elevated sessions
    invite   mint a one-time enrollment code for /admin/setup  [--ttl 30]
    set      write a passphrase directly (prompted, never echoed)
    unlock   clear a brute-force lockout
    revoke   end every elevated session for the account
`);
    process.exit(1);
  }

  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    fail("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (.env.local or environment).");
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const userId = await resolveAdmin(supabase, arg("email"), arg("user-id"));
  await requireAdminFlag(supabase, userId);

  if (command === "status") return status(supabase, userId);
  if (command === "invite") return invite(supabase, userId, Number(arg("ttl")) > 0 ? Number(arg("ttl")) : 30);
  if (command === "set") return set(supabase, userId);
  if (command === "unlock") return unlock(supabase, userId);
  return revoke(supabase, userId);
}

// Importable for tests (test/admin/cli-passphrase.test.ts checks that hashes
// written here verify against the app's own implementation) — only the direct
// invocation touches the database.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => fail(error?.message ?? String(error)));
}
