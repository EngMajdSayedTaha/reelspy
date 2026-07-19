import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { seedTrending } from "@/lib/trends/niche";
import { slugifyNiche } from "@/lib/trends/shared";
import {
  isShowcaseNiche,
  toPublicReels,
  SHOWCASE_NICHES,
  SHOWCASE_LIMIT,
  type PublicTrendingPayload,
} from "@/lib/trends/public-showcase";

// The ONLY unauthenticated data endpoint in the app. It backs the "live
// trending" section on the marketing site (reelspy.dev), which fetches it
// server-side at build/revalidate time — so this is read by our own landing
// zone, not by browsers, and needs no CORS headers.
//
// Three deliberate constraints, because "public" here means genuinely public:
//  1. seedTrending, never nicheTrending. The seed pool is a CURATED list of
//     large public accounts (scripts/seed-data/seed-accounts.json). The
//     cross-user aggregate is derived from what our paying users chose to
//     track — that's their competitive research, and it must not leak out of
//     the dashboard.
//  2. A fixed niche allowlist (not listSeedNiches) so an open query param
//     can't enumerate the taxonomy or fan out arbitrary work.
//  3. A subset payload — internal ranking scores stay server-side.
export const runtime = "nodejs";

// Trending moves on the order of days, and the underlying snapshot cache only
// changes when the refresh crons run. Half an hour at the CDN with a day of
// stale-while-revalidate means the origin is hit a handful of times a day and
// a cold cache never blocks a visitor on a DB round-trip.
const CACHE_CONTROL = "public, s-maxage=1800, stale-while-revalidate=86400";

// In-window lookback. Matches the dashboard's Niche Radar default.
const DAYS = 14;

// Hard ceiling on the DB work. The Supabase client has no default timeout, so
// a degraded database would otherwise hold this function open until the
// platform kills it — and because the marketing page fetches this during
// render, that stall would propagate to a visitor-facing page. Falling back to
// an empty list (and therefore to the landing's fixtures) is strictly better
// than a slow page.
const QUERY_TIMEOUT_MS = 5_000;

function withTimeout<T>(work: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), QUERY_TIMEOUT_MS)),
  ]);
}

export async function GET(request: Request) {
  const requested = new URL(request.url).searchParams.get("niche");
  const niche = slugifyNiche(requested ?? SHOWCASE_NICHES[0]);

  if (!isShowcaseNiche(niche)) {
    return NextResponse.json(
      { error: "unknown_niche", allowed: SHOWCASE_NICHES },
      { status: 400, headers: { "Cache-Control": CACHE_CONTROL } }
    );
  }

  // Fail soft, always. This endpoint feeds a marketing page: an empty list
  // makes the landing fall back to its curated fixtures, whereas a 500 would
  // surface as a broken section. Cache the empty response too, so an outage
  // doesn't turn into a stampede on the origin.
  let reels: PublicTrendingPayload["reels"] = [];
  try {
    const admin = createAdminClient();
    // Over-fetch so the permalink/thumbnail filtering in toPublicReels can
    // drop unusable rows without leaving a short grid.
    const found = await withTimeout(
      seedTrending(admin, { niche, days: DAYS, limit: SHOWCASE_LIMIT * 3 }),
      []
    );
    reels = toPublicReels(found, SHOWCASE_LIMIT);
  } catch (err) {
    console.error("[public/trending] failed", { niche, err });
  }

  return NextResponse.json(
    { niche, reels, generatedAt: new Date().toISOString() } satisfies PublicTrendingPayload,
    { headers: { "Cache-Control": CACHE_CONTROL } }
  );
}
