import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { processReel } from "@/lib/media/pipeline";

// Transcription providers are async and polled, so allow a generous budget.
// Vercel clamps this to the plan's maximum function duration.
export const runtime = "nodejs";
export const maxDuration = 300;

const bodySchema = z
  .object({
    force: z.boolean().optional(),
  })
  .optional();

type RouteContext = { params: Promise<{ reel_id: string }> };

// Map internal failure reasons to user-friendly copy without leaking which
// tools/providers run under the hood.
function friendlyTranscriptError(reason: string): string {
  const r = reason.toLowerCase();
  if (r.includes("too large") || r.includes("25 mb")) {
    return "This reel's audio is too long to transcribe. Shorter reels work best.";
  }
  if (r.includes("private") || r.includes("login") || r.includes("cookies")) {
    return "This reel couldn't be accessed — it may be private or restricted.";
  }
  if (r.includes("rate") && r.includes("limit")) {
    return "Transcription is busy right now. Please try again in a few minutes.";
  }
  if (r.includes("no transcription provider")) {
    return "Transcription isn't set up on the server yet.";
  }
  return "We couldn't transcribe this reel right now. Please try again shortly.";
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { reel_id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: reel, error } = await supabase
    .from("tracked_reels")
    .select(
      "id, transcript, transcript_srt, transcript_lang, transcript_source, transcript_status, transcript_generated_at"
    )
    .eq("id", reel_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!reel) {
    return NextResponse.json({ error: "Reel not found." }, { status: 404 });
  }

  return NextResponse.json({
    transcript: reel.transcript ?? null,
    srt: reel.transcript_srt ?? null,
    status: reel.transcript_status ?? "none",
    source: reel.transcript_source ?? null,
    language: reel.transcript_lang ?? null,
    generated_at: reel.transcript_generated_at ?? null,
  });
}

export async function POST(request: Request, { params }: RouteContext) {
  const { reel_id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawBody = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(rawBody);
  const force = parsed.success ? parsed.data?.force ?? false : false;

  const { data: reel, error: reelError } = await supabase
    .from("tracked_reels")
    .select(
      "id, ig_permalink, transcript, transcript_srt, transcript_lang, transcript_source, transcript_status"
    )
    .eq("id", reel_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (reelError) {
    return NextResponse.json({ error: reelError.message }, { status: 500 });
  }
  if (!reel) {
    return NextResponse.json({ error: "Reel not found." }, { status: 404 });
  }

  // Serve the cached transcript unless an explicit refresh was requested.
  if (!force && reel.transcript_status === "ready" && reel.transcript) {
    return NextResponse.json({
      transcript: reel.transcript,
      srt: reel.transcript_srt ?? null,
      status: "ready",
      source: reel.transcript_source ?? null,
      language: reel.transcript_lang ?? null,
      cached: true,
    });
  }

  // The pipeline runs yt-dlp + Whisper (minutes of compute) — don't start a
  // second run while one is in flight. `force` stays available as the escape
  // hatch if a crashed run ever leaves the status stuck on pending.
  if (!force && reel.transcript_status === "pending") {
    return NextResponse.json(
      { error: "A transcript is already being generated for this reel. Try again shortly.", status: "pending" },
      { status: 409 }
    );
  }

  // Mark in-flight (best effort — failures here should not block the request).
  await supabase
    .from("tracked_reels")
    .update({ transcript_status: "pending" })
    .eq("id", reel.id)
    .eq("user_id", user.id);

  // Extract reel metadata + direct media URL via yt-dlp, then transcribe with Whisper.
  const result = await processReel(reel.ig_permalink);

  if (result.status !== "ready") {
    // The raw reason (provider names, API bodies) stays in the server logs;
    // the UI gets a friendly, tool-agnostic message.
    console.error(`[transcript] reel=${reel.id} unavailable: ${result.reason}`);

    await supabase
      .from("tracked_reels")
      .update({ transcript_status: "failed" })
      .eq("id", reel.id)
      .eq("user_id", user.id);

    return NextResponse.json(
      { error: friendlyTranscriptError(result.reason), status: "failed" },
      { status: 502 }
    );
  }

  const { error: updateError } = await supabase
    .from("tracked_reels")
    .update({
      transcript: result.text,
      transcript_srt: result.srt,
      transcript_lang: result.language,
      transcript_source: result.source,
      transcript_status: "ready",
      transcript_generated_at: new Date().toISOString(),
    })
    .eq("id", reel.id)
    .eq("user_id", user.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    transcript: result.text,
    srt: result.srt,
    status: "ready",
    source: result.source,
    language: result.language,
    cached: false,
  });
}
