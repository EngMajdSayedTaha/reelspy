#!/usr/bin/env node
// Backfill the admin-managed plan catalog from the constants this build ships
// with, so /admin/plans opens on the plans that already exist rather than on an
// empty table.
//
//   node scripts/seed-plan-catalog.mjs [--dry-run]
//
// Writes the four fixed tiers plus the build-your-own plan into `plans`, their
// EN + AR copy into `plan_copy`, and one `plan_prices` row per tier whose
// STRIPE_PRICE_* env var is set. It also resolves each Stripe Price's PRODUCT id
// onto the plan, which is what later lets a coupon be restricted to specific
// plans (applies_to.products) — nothing else records it today.
//
// IDEMPOTENT: every write is an upsert keyed on the natural key (plan slug,
// plan+locale, Stripe price id), so re-running it is a no-op. Safe to run before
// or after the app has started reading the catalog — until rows exist, the app
// falls back to these same constants (lib/billing/catalog.ts).

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

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

loadEnv();

const DRY_RUN = process.argv.includes("--dry-run");
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY?.trim();

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("[seed-plans] NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing.");
  process.exit(1);
}

const UNLIMITED = -1;

// Mirrors lib/billing/entitlements.ts + lib/billing/plans.ts +
// lib/i18n/dictionaries/billing.ts as they stand at seed time. Duplicated here
// on purpose: this is a one-shot data migration, and it must keep writing the
// values that were current when it ran even after the app's constants move on.
const SEED = [
  {
    slug: "free",
    kind: "free",
    sortOrder: 10,
    priceEnv: null,
    priceAed: 0,
    entitlements: { accounts: 3, scripts_mo: 10, transcripts_mo: 5, automations: 0, publish_targets: 0, ig_connections: 1, model: "haiku" },
    copy: {
      en: { name: "Free", tagline: "Try the workflow", highlights: ["3 tracked accounts", "10 scripts / month", "Caption-only AI"] },
      ar: { name: "مجانية", tagline: "جرّب سير العمل", highlights: ["3 حسابات متابَعة", "10 نصوص شهريًا", "ذكاء اصطناعي بالوصف فقط"] },
    },
  },
  {
    slug: "creator",
    kind: "fixed",
    sortOrder: 20,
    priceEnv: "STRIPE_PRICE_CREATOR",
    priceAed: 49,
    entitlements: { accounts: 30, scripts_mo: 60, transcripts_mo: 30, automations: 15, publish_targets: 1, ig_connections: 1, model: "sonnet" },
    copy: {
      en: { name: "Creator", tagline: "Solo operators", highlights: ["30 tracked accounts", "60 scripts / month", "Claude Sonnet scripts", "15 auto-replies"] },
      ar: { name: "Creator", tagline: "للعاملين المستقلين", highlights: ["30 حسابًا متابَعًا", "60 نصًا شهريًا", "نصوص Claude Sonnet", "15 ردًا آليًا"] },
    },
  },
  {
    slug: "pro",
    kind: "fixed",
    sortOrder: 30,
    priceEnv: "STRIPE_PRICE_PRO",
    priceAed: 149,
    entitlements: { accounts: 50, scripts_mo: 200, transcripts_mo: 100, automations: 30, publish_targets: 4, ig_connections: 1, model: "opus" },
    copy: {
      en: { name: "Pro", tagline: "Serious creators & SMMs", highlights: ["50 tracked accounts", "200 scripts / month", "Claude Opus scripts", "30 auto-replies", "4 publish targets"] },
      ar: { name: "Pro", tagline: "لصنّاع المحتوى الجادّين ومديري وسائل التواصل الاجتماعي", highlights: ["50 حسابًا متابَعًا", "200 نص شهريًا", "نصوص Claude Opus", "30 ردًا آليًا", "4 وجهات نشر"] },
    },
  },
  {
    slug: "studio",
    kind: "fixed",
    sortOrder: 40,
    priceEnv: "STRIPE_PRICE_STUDIO",
    priceAed: 349,
    // The plan admins resolve to, replacing the hardcoded "studio" that used to
    // live in resolveUserTier.
    adminGrant: true,
    entitlements: { accounts: 100, scripts_mo: UNLIMITED, transcripts_mo: UNLIMITED, automations: 60, publish_targets: 4, ig_connections: 5, model: "opus" },
    copy: {
      en: { name: "Studio", tagline: "Agencies & teams", highlights: ["100 tracked accounts", "Unlimited scripts", "Claude Opus scripts", "60 auto-replies", "4 publish targets"] },
      ar: { name: "Studio", tagline: "للوكالات والفرق", highlights: ["100 حساب متابَع", "نصوص غير محدودة", "نصوص Claude Opus", "60 ردًا آليًا", "4 وجهات نشر"] },
    },
  },
  {
    // No plan_prices row: the build-your-own card prices each configuration
    // ad hoc (lib/billing/custom-pricing.ts).
    slug: "custom",
    kind: "custom",
    sortOrder: 999,
    priceEnv: null,
    priceAed: null,
    entitlements: { accounts: 30, scripts_mo: 60, transcripts_mo: 30, automations: 15, publish_targets: 1, ig_connections: 1, model: "sonnet" },
    copy: {
      en: { name: "Custom", tagline: "Build your own", highlights: ["Set your own limits below"] },
      ar: { name: "مخصّصة", tagline: "صمّم باقتك", highlights: ["حدّد الحدود الخاصة بك أدناه"] },
    },
  },
];

async function rest(path, { method = "GET", body, headers = {} } = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

// The Stripe Product a Price hangs off. Needed so a coupon can later be scoped
// to specific plans; best-effort, since a missing product only costs us that.
async function productForPrice(priceId) {
  if (!STRIPE_KEY) return null;
  try {
    const res = await fetch(`https://api.stripe.com/v1/prices/${priceId}`, {
      headers: { Authorization: `Bearer ${STRIPE_KEY}` },
    });
    if (!res.ok) return null;
    const price = await res.json();
    return typeof price.product === "string" ? price.product : (price.product?.id ?? null);
  } catch {
    return null;
  }
}

async function main() {
  console.log(`[seed-plans] ${DRY_RUN ? "DRY RUN — " : ""}seeding ${SEED.length} plans into ${SUPABASE_URL}`);

  for (const plan of SEED) {
    const priceId = plan.priceEnv ? process.env[plan.priceEnv]?.trim() : null;
    const productId = priceId ? await productForPrice(priceId) : null;

    const planRow = {
      slug: plan.slug,
      kind: plan.kind,
      status: "published",
      sort_order: plan.sortOrder,
      entitlements: plan.entitlements,
      trial_days: 0,
      default_currency: "aed",
      stripe_product_id: productId,
      admin_grant: plan.adminGrant === true,
      updated_at: new Date().toISOString(),
    };

    if (DRY_RUN) {
      console.log(
        `  ${plan.slug.padEnd(8)} price=${priceId ?? "—"} product=${productId ?? "—"} amount=${
          plan.priceAed === null ? "ad hoc" : `AED ${plan.priceAed}`
        }`
      );
      continue;
    }

    // on_conflict=slug + merge-duplicates makes a re-run harmless.
    const [saved] = await rest("plans?on_conflict=slug", {
      method: "POST",
      body: [planRow],
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    });

    await rest("plan_copy?on_conflict=plan_id,locale", {
      method: "POST",
      body: ["en", "ar"].map((locale) => ({
        plan_id: saved.id,
        locale,
        name: plan.copy[locale].name,
        tagline: plan.copy[locale].tagline,
        highlights: plan.copy[locale].highlights,
      })),
      headers: { Prefer: "resolution=merge-duplicates" },
    });

    if (priceId && plan.priceAed) {
      await rest("plan_prices?on_conflict=stripe_price_id", {
        method: "POST",
        body: [
          {
            plan_id: saved.id,
            interval: "month",
            currency: "aed",
            unit_amount: plan.priceAed * 100, // MINOR units
            stripe_price_id: priceId,
            is_current: true,
          },
        ],
        headers: { Prefer: "resolution=merge-duplicates" },
      });
    }

    console.log(
      `  ✓ ${plan.slug.padEnd(8)} ${priceId ? `${priceId} (AED ${plan.priceAed})` : "no price configured"}`
    );
  }

  if (!DRY_RUN) {
    console.log("[seed-plans] done. The catalog is now authoritative; /admin/plans lists these.");
  }
}

main().catch((err) => {
  console.error("[seed-plans] failed:", err.message);
  process.exit(1);
});
