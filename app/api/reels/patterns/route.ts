import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { detectViralPattern } from "@/lib/ai/claude";

// Batched viral-pattern tagging: classifies reels missing a pattern with Claude
// (caption + transcript when available) and records the result. Each reel is
// marked `pattern_checked_at` so it is tagged at most once; the client loops
// calling this until `remaining` reaches 0.
export const runtime = "nodejs";
export const maxDuration = 300;

const BATCH_SIZE = 8;

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
    .select("id, caption, transcript")
    .eq("user_id", user.id)
    .is("viral_pattern", null)
    .is("pattern_checked_at", null)
    .order("viral_score", { ascending: false, nullsFirst: false })
    .limit(BATCH_SIZE);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let updated = 0;
  const now = new Date().toISOString();

  for (const reel of reels ?? []) {
    let pattern: string | null = null;
    try {
      pattern = await detectViralPattern({ caption: reel.caption, transcript: reel.transcript });
    } catch {
      pattern = null;
    }

    await supabase
      .from("tracked_reels")
      .update({ viral_pattern: pattern, pattern_checked_at: now })
      .eq("id", reel.id)
      .eq("user_id", user.id);

    if (pattern) {
      updated += 1;
    }
  }

  const { count: remaining } = await supabase
    .from("tracked_reels")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("viral_pattern", null)
    .is("pattern_checked_at", null);

  return NextResponse.json({
    processed: reels?.length ?? 0,
    updated,
    remaining: remaining ?? 0,
  });
}
