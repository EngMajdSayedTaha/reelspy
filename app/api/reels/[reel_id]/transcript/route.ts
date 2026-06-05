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
    .select("id, transcript, transcript_lang, transcript_source, transcript_status, transcript_generated_at")
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
    .select("id, ig_permalink, transcript, transcript_lang, transcript_source, transcript_status")
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
      status: "ready",
      source: reel.transcript_source ?? null,
      language: reel.transcript_lang ?? null,
      cached: true,
    });
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
    // Surface the real reason in the Vercel runtime logs for debugging.
    console.error(`[transcript] reel=${reel.id} unavailable: ${result.reason}`);

    await supabase
      .from("tracked_reels")
      .update({ transcript_status: "failed" })
      .eq("id", reel.id)
      .eq("user_id", user.id);

    return NextResponse.json({ error: result.reason, status: "failed" }, { status: 502 });
  }

  const { error: updateError } = await supabase
    .from("tracked_reels")
    .update({
      transcript: result.text,
      transcript_lang: result.language,
      transcript_source: result.source,
      transcript_status: "ready",
      transcript_generated_at: new Date().toISOString(),
      media_duration_sec: result.metadata.durationSec,
    })
    .eq("id", reel.id)
    .eq("user_id", user.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    transcript: result.text,
    status: "ready",
    source: result.source,
    language: result.language,
    duration_sec: result.metadata.durationSec,
    cached: false,
  });
}
