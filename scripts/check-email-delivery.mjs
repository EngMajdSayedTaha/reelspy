// Live-fire check of the auth email path: Resend (sending domain) and Supabase
// Auth's SMTP credentials. Written after a migration silently broke SMTP auth
// and every signup/reset died with a 500 nobody saw — the app showed "check
// your inbox" while GoTrue was answering 535 "Authentication credentials
// invalid" to every send.
//
//   node scripts/check-email-delivery.mjs you@example.com
//
// The address must be a REAL registered account: Supabase short-circuits
// /recover for unknown addresses (anti-enumeration) and returns 200 without
// ever opening an SMTP connection, so an unregistered address would give a
// false all-clear. A healthy run therefore sends you a real password-reset
// email — that arriving in your inbox IS the passing test.

import fs from "node:fs";
import path from "node:path";

function parseEnvFile(content) {
  const values = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const equalsIndex = line.indexOf("=");
    if (equalsIndex === -1) continue;
    values[line.slice(0, equalsIndex).trim()] = line.slice(equalsIndex + 1).trim();
  }
  return values;
}

const envPath = path.join(process.cwd(), ".env.local");
const fileEnv = fs.existsSync(envPath) ? parseEnvFile(fs.readFileSync(envPath, "utf8")) : {};
const env = { ...fileEnv, ...process.env };

const email = process.argv[2];
if (!email || !email.includes("@")) {
  console.error("Usage: node scripts/check-email-delivery.mjs <email-of-a-real-account>");
  console.error("Sends a real password-reset email to that address when SMTP is healthy.");
  process.exit(1);
}

let failed = false;

// 1. Resend — is the API key live and the sending domain verified? The same key
// doubles as the SMTP password in Supabase, so a 401 here explains a 535 there.
if (env.RESEND_API_KEY) {
  const res = await fetch("https://api.resend.com/domains", {
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
  });
  if (res.status === 401 || res.status === 403) {
    console.error(`[ERROR] Resend rejected RESEND_API_KEY (HTTP ${res.status}). The key is revoked or wrong.`);
    console.error("        Supabase uses this same key as its SMTP password — regenerate it in both places.");
    failed = true;
  } else if (!res.ok) {
    console.warn(`[WARN] Could not reach Resend (HTTP ${res.status}) — skipping the domain check.`);
  } else {
    const { data = [] } = await res.json();
    const domains = data.map((d) => `${d.name} (${d.status})`).join(", ") || "none";
    const verified = data.filter((d) => d.status === "verified").map((d) => d.name);
    console.log(`[OK] Resend key is valid. Domains: ${domains}`);
    if (verified.length === 0) {
      console.error("[ERROR] No verified sending domain in Resend. Resend refuses mail from unverified domains,");
      console.error("        so Supabase's sender address must belong to a verified one. Add the DKIM/SPF records.");
      failed = true;
    }
    if (env.EMAIL_FROM) {
      const fromDomain = env.EMAIL_FROM.split("@").pop()?.replace(/>$/, "").trim();
      if (fromDomain && !verified.includes(fromDomain)) {
        console.error(`[ERROR] EMAIL_FROM sends from "${fromDomain}", which is not verified in Resend.`);
        failed = true;
      }
    }
  }
} else {
  console.warn("[WARN] RESEND_API_KEY not set locally — skipping Resend checks (it may still be set in Vercel).");
}

// 2. Supabase Auth — the real test. A 500 here means GoTrue could not hand the
// message to SMTP: bad credentials, or a sender address the provider refuses.
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!supabaseUrl || !anonKey) {
  console.error("[ERROR] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY missing — cannot test SMTP.");
  process.exit(1);
}

const res = await fetch(`${supabaseUrl}/auth/v1/recover`, {
  method: "POST",
  headers: { apikey: anonKey, "Content-Type": "application/json" },
  body: JSON.stringify({ email }),
});
const body = await res.text();

if (res.status === 200) {
  console.log(`[OK] Supabase accepted the send. A reset email is on its way to ${email}.`);
  console.log("     If it never arrives, the failure is downstream (Resend suppression list, spam, DNS) —");
  console.log("     check the Resend dashboard's Emails tab for the delivery event.");
} else if (res.status === 429) {
  console.warn("[WARN] Rate-limited (429) — inconclusive. Wait a few minutes and re-run.");
} else if (res.status >= 500) {
  console.error(`[ERROR] Supabase could not send (HTTP ${res.status}): ${body.slice(0, 300)}`);
  console.error("        This is an SMTP-level failure. Check Supabase -> Auth -> SMTP Settings:");
  console.error("        host smtp.resend.com | port 465 | username literally \"resend\" | password = a live Resend API key");
  failed = true;
} else {
  console.error(`[ERROR] Unexpected response (HTTP ${res.status}): ${body.slice(0, 300)}`);
  failed = true;
}

process.exit(failed ? 1 : 0);
