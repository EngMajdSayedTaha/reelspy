import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getReelMetadata } from "@/lib/media/ytdlp";

// Batched duration backfill: probes reels missing a duration with yt-dlp
// metadata (no video download) and records the result. Each reel is marked
// `duration_checked_at` whether it succeeds or not, so it is never retried by
// this job — the client loops calling this until `remaining` reaches 0.
export const runtime = "nodejs";
export const maxDuration = 300;

const BATCH_SIZE = 10;
const DELAY_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: reels, error } = await supabase
    .from("tracked_reels")
    .select("id, ig_permalink")
    .eq("user_id", user.id)
    .is("media_duration_sec", null)
    .is("duration_checked_at", null)
    .order("posted_at", { ascending: false, nullsFirst: false })
    .limit(BATCH_SIZE);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let updated = 0;
  const errors: string[] = [];
  const now = new Date().toISOString();

  for (const reel of reels ?? []) {
    let durationSec: number | null = null;
    try {
      const metadata = await getReelMetadata(reel.ig_permalink);
      durationSec = metadata.durationSec;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "yt-dlp failed";
      errors.push(message.slice(0, 120));
    }

    // Record the attempt regardless of outcome so it is not probed again.
    await supabase
      .from("tracked_reels")
      .update({ media_duration_sec: durationSec, duration_checked_at: now })
      .eq("id", reel.id)
      .eq("user_id", user.id);

    if (durationSec != null) {
      updated += 1;
    }

    await sleep(DELAY_MS);
  }

  const { count: remaining } = await supabase
    .from("tracked_reels")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("media_duration_sec", null)
    .is("duration_checked_at", null);

  return NextResponse.json({
    processed: reels?.length ?? 0,
    updated,
    remaining: remaining ?? 0,
    errors: errors.slice(0, 5),
  });
}
