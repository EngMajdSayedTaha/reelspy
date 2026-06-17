import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchGridReels, gridScrapeEnabled, extractShortcode } from "@/lib/instagram/grid-scrape";

// Diagnostic for the collab-reel grid fallback. The scrape fails SILENTLY by
// design (so a broken scrape never breaks a sync), which makes "why didn't my
// collab reel show up?" impossible to answer from the outside. This endpoint
// runs the exact same grid path and reports what happened, so we can tell apart
// the distinct failure modes: feature off, cookies missing/stale, Instagram
// block (403), account not found, or "scraped fine but the reel was deduped
// because Business Discovery already had it".
//
// Auth-gated (any signed-in user) and read-only — it never writes snapshots.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const username = (url.searchParams.get("username") || "").trim().replace(/^@+/, "").toLowerCase();
  if (!username) {
    return NextResponse.json({ error: "Pass ?username=<handle>." }, { status: 400 });
  }

  // Surface the gating up front — the two most common "nothing happened" causes.
  const cookiesPresent = Boolean(process.env.YTDLP_COOKIES_B64);
  const enabled = gridScrapeEnabled();

  const grid = await fetchGridReels(username, 24);

  // Cross-reference against what's already cached for this account, so we can see
  // whether a scraped reel is genuinely NEW (a collab Business Discovery missed)
  // or would be deduped away. Compare on shortcode, the id format both sources
  // share.
  const admin = createAdminClient();
  const { data: snapRows } = await admin
    .from("ig_reel_snapshots")
    .select("permalink")
    .eq("ig_username", username);
  const knownShortcodes = new Set(
    (snapRows ?? [])
      .map((r) => extractShortcode(r.permalink))
      .filter((s): s is string => Boolean(s))
  );

  const reels = grid.reels.map((r) => ({
    shortcode: r.shortcode,
    permalink: r.permalink,
    coauthors: r.coauthors,
    postedAt: r.postedAt,
    viewCount: r.viewCount,
    // The interesting bit: is this reel already in our cache, or is it a
    // collab the grid recovered that Business Discovery never returned?
    alreadyCached: knownShortcodes.has(r.shortcode),
  }));

  return NextResponse.json({
    username,
    config: {
      gridScrapeEnabled: enabled,
      cookiesPresent,
      // Spell out the gate so a "disabled" status is unambiguous.
      envEnableGridScrape: process.env.ENABLE_GRID_SCRAPE ?? "(unset, defaults on)",
    },
    grid: {
      status: grid.status,
      error: grid.error,
      reelsFound: grid.reels.length,
      newCollabReels: reels.filter((r) => !r.alreadyCached).length,
    },
    reels,
  });
}
