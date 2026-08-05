import { NextResponse } from "next/server";
import { RELEASES } from "@/lib/release/releases";
import { CURRENT_VERSION } from "@/lib/release/version";
import type { Release } from "@/lib/release/types";

// Public changelog. The second unauthenticated endpoint in the app (after
// /api/public/trending), and by far the least sensitive one: it serves a static
// file that already ships in the client bundle of /dashboard/whats-new.
//
// It exists so the marketing site can render reelspy.dev/changelog from the SAME
// source of truth as the dashboard, instead of keeping a second copy that would
// drift the first time someone shipped in a hurry. The landing fetches it
// server-side at revalidate time (lib/changelog/fetch.ts over there), so this is
// read by our own zone, not by browsers — no CORS headers needed.
//
// Both locales are returned; the marketing site has its own language toggle and
// picks a side at render time.
export const runtime = "nodejs";

// The payload only changes when we deploy, and a deploy purges the CDN anyway,
// so a long TTL costs nothing and a stale-while-revalidate day means an outage
// on this origin never blanks the marketing page.
const CACHE_CONTROL = "public, s-maxage=3600, stale-while-revalidate=86400";

export type PublicChangelogPayload = {
  version: string;
  releases: Release[];
  generatedAt: string;
};

export async function GET() {
  return NextResponse.json(
    {
      version: CURRENT_VERSION,
      releases: RELEASES,
      generatedAt: new Date().toISOString(),
    } satisfies PublicChangelogPayload,
    { headers: { "Cache-Control": CACHE_CONTROL } }
  );
}
