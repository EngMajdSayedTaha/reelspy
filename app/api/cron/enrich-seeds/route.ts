import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createMetaRateLimiter, SYSTEM_USER_ID } from "@/lib/instagram/rate-limit";
import { pickHealthyToken } from "@/lib/instagram/snapshots";
import { enrichSeedAccounts } from "@/lib/instagram/enrich";
import { mirrorShowcaseVideos } from "@/lib/instagram/showcase-video";
import { cronAuthorized } from "@/lib/utils/cron";
import { numEnv } from "@/lib/utils/env";

// Admin-triggered (Operations > Cron) validator + enricher for the cold-start
// seed pool (seed_accounts). It is NOT a scheduled Vercel cron — the Hobby plan
// caps a project at 2 crons, so the daily refresh-snapshots cron drains a seed
// batch too (both share lib/instagram/enrich.ts). This route is for on-demand
// bulk backfill: run it repeatedly until the JSON `remaining` hits 0.
//
// Also mirrors showcase videos, same as refresh-snapshots does: this route
// writes the raw video_url the mirror step needs, and running it here too
// means an admin backfilling the seed pool doesn't need a second trip through
// refresh-snapshots — which processes every live tracked account first and so
// can spend its whole run before ever reaching the seed batch.
export const runtime = "nodejs";
export const maxDuration = 300;

const BATCH = numEnv("SEED_ENRICH_BATCH", 100);
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

  // Pure DB + Storage IO — spends no Meta quota, so it runs even when the
  // enrichment above got rate-limited. Swallowed on purpose, same as
  // refresh-snapshots: the marketing page degrades to stills, which isn't
  // worth failing this route over.
  let videos = null;
  try {
    videos = await mirrorShowcaseVideos(admin);
  } catch (err) {
    console.warn(
      "[enrich-seeds] showcase video mirror failed:",
      err instanceof Error ? err.message : err
    );
  }

  return NextResponse.json({ ok: true, ...stats, videos });
}
