import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createMetaRateLimiter, SYSTEM_USER_ID } from "@/lib/instagram/rate-limit";
import { pickHealthyToken } from "@/lib/instagram/snapshots";
import { enrichSeedAccounts } from "@/lib/instagram/enrich";
import { cronAuthorized } from "@/lib/utils/cron";
import { numEnv } from "@/lib/utils/env";

// Admin-triggered (Operations > Cron) validator + enricher for the cold-start
// seed pool (seed_accounts). It is NOT a scheduled Vercel cron — the Hobby plan
// caps a project at 2 crons, so the daily refresh-snapshots cron drains a seed
// batch too (both share lib/instagram/enrich.ts). This route is for on-demand
// bulk backfill: run it repeatedly until the JSON `remaining` hits 0.
export const runtime = "nodejs";
export const maxDuration = 300;

const BATCH = numEnv("SEED_ENRICH_BATCH", 50);
const HOURLY_BUDGET = numEnv("META_HOURLY_BUDGET", 160);

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // A single healthy token is enough — Business Discovery reads any public
  // account, and the rate limit is app-level.
  const caller = await pickHealthyToken(admin);
  if (!caller) {
    return NextResponse.json({ ok: true, processed: 0, note: "No connected accounts yet." });
  }

  const limiter = createMetaRateLimiter(admin, SYSTEM_USER_ID, HOURLY_BUDGET);
  const stats = await enrichSeedAccounts(admin, limiter, caller, { batch: BATCH });

  return NextResponse.json({ ok: true, ...stats });
}
