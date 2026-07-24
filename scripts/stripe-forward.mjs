#!/usr/bin/env node
// Local Stripe webhook forwarder — a zero-install stand-in for `stripe listen`.
//
// Stripe can't reach http://localhost, so nothing in the billing lifecycle
// (subscription created, invoice paid, refund, cancellation, dispute) reaches the
// app during local testing. This polls the Stripe Events API and re-delivers each
// new event to the local webhook route, signed with STRIPE_WEBHOOK_SECRET exactly
// the way Stripe signs a real delivery — so the route's signature verification is
// exercised for real, not bypassed.
//
//   node scripts/stripe-forward.mjs [--url http://localhost:3000/api/stripe/webhook]
//                                   [--since 30]   # replay the last N minutes too
//
// Events are pulled through the SAME pinned API version the app uses, so payload
// shapes always match (a mismatch here is what made current_period_end vanish
// once). Re-delivery is safe: the route dedupes on event id via `billing_events`.

import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// The app pins this in lib/billing/stripe.ts — keep the two in step.
const API_VERSION = "2025-02-24.acacia";
const POLL_MS = 2000;

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
    const key = m[1];
    let value = m[2].trim();
    if (/^".*"$/.test(value) || /^'.*'$/.test(value)) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

loadEnv();

const SECRET_KEY = process.env.STRIPE_SECRET_KEY?.trim();
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET?.trim();
const TARGET = arg("url", "http://localhost:3000/api/stripe/webhook");
const SINCE_MIN = Number(arg("since", "0"));

if (!SECRET_KEY || !WEBHOOK_SECRET) {
  console.error(
    "Missing STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET in .env.local — nothing to forward."
  );
  process.exit(1);
}

// Sign the payload the way Stripe does: HMAC-SHA256 over "<timestamp>.<body>".
function signature(payload) {
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", WEBHOOK_SECRET).update(`${t}.${payload}`, "utf8").digest("hex");
  return `t=${t},v1=${v1}`;
}

async function listEvents(sinceUnix) {
  const url = new URL("https://api.stripe.com/v1/events");
  url.searchParams.set("limit", "50");
  url.searchParams.set("created[gte]", String(sinceUnix));
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${SECRET_KEY}`,
      "Stripe-Version": API_VERSION,
    },
  });
  if (!res.ok) {
    throw new Error(`Stripe events list failed: ${res.status} ${await res.text()}`);
  }
  const body = await res.json();
  // Stripe returns newest-first; replay in the order they happened.
  return (body.data ?? []).reverse();
}

async function deliver(event) {
  const payload = JSON.stringify(event);
  const res = await fetch(TARGET, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Stripe-Signature": signature(payload) },
    body: payload,
  });
  const text = await res.text();
  const mark = res.ok ? "✓" : "✗";
  console.log(`${mark} [${res.status}] ${event.type}  ${event.id}${res.ok ? "" : `  ${text.slice(0, 200)}`}`);
}

const seen = new Set();
let cursor = Math.floor(Date.now() / 1000) - (Number.isFinite(SINCE_MIN) ? SINCE_MIN * 60 : 0);

console.log(`Forwarding Stripe events -> ${TARGET}`);
console.log(`API version ${API_VERSION}${SINCE_MIN ? `, replaying the last ${SINCE_MIN} min` : ""}. Ctrl+C to stop.\n`);

// Poll rather than stream: the Events API has no long-poll, and 2s is well inside
// what feels instant when you're clicking through checkout.
for (;;) {
  try {
    const events = await listEvents(cursor);
    for (const event of events) {
      if (seen.has(event.id)) continue;
      seen.add(event.id);
      if (event.created >= cursor) cursor = event.created; // never re-scan old pages
      await deliver(event);
    }
  } catch (err) {
    console.error(`! ${err instanceof Error ? err.message : err}`);
  }
  await new Promise((r) => setTimeout(r, POLL_MS));
}
