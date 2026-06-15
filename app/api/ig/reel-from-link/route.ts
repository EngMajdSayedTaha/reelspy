import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getReelMetadata, YtDlpUnavailableError } from "@/lib/media/ytdlp";
import { transcribeReel } from "@/lib/transcription";

// Transcription runs yt-dlp + Whisper — allow up to 5 minutes.
export const runtime = "nodejs";
export const maxDuration = 300;

// Matches /reel/, /reels/, or /p/ — optionally preceded by a username.
const IG_URL_RE = /instagram\.com\/(?:[a-z0-9._]{1,30}\/)?(?:reel|reels|p)\/([A-Za-z0-9_-]+)/i;
// Extracts the username when the URL itself contains /username/reel/SHORTCODE.
const IG_USERNAME_FROM_URL_RE =
  /instagram\.com\/([a-z0-9._]{1,30})\/(?:reel|reels|p)\//i;

const bodySchema = z.object({
  url: z.string().url().max(500),
});

// Drop tracking query params (igsh, etc.) before passing to yt-dlp.
function cleanIgUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return `${u.origin}${u.pathname}`;
  } catch {
    return raw;
  }
}

// yt-dlp returns uploader_url like https://www.instagram.com/majdst_codes/
// — the real handle is the last path segment.
function usernameFromUploaderUrl(url: string | null): string {
  if (!url) return "";
  const match = /instagram\.com\/([a-z0-9._]{1,30})\/?$/i.exec(url);
  return match?.[1]?.toLowerCase() ?? "";
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawBody = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid URL." }, { status: 400 });
  }

  const cleanUrl = cleanIgUrl(parsed.data.url);

  if (!IG_URL_RE.test(cleanUrl)) {
    return NextResponse.json(
      { error: "That doesn't look like an Instagram reel link." },
      { status: 400 }
    );
  }

  // Fallback: username embedded in the URL path itself.
  const usernameMatch = IG_USERNAME_FROM_URL_RE.exec(cleanUrl);
  const urlUsername = usernameMatch?.[1]?.toLowerCase() ?? "";

  // Single yt-dlp call: gets description, uploader_url, thumbnail, AND the
  // direct media URL needed for transcription — no second yt-dlp invocation.
  let metadata: Awaited<ReturnType<typeof getReelMetadata>>;
  try {
    metadata = await getReelMetadata(cleanUrl);
  } catch (err) {
    if (err instanceof YtDlpUnavailableError) {
      return NextResponse.json(
        { error: "Video processing is temporarily unavailable. Try again shortly." },
        { status: 503 }
      );
    }
    const message = err instanceof Error ? err.message : "Failed to read reel.";
    console.error("[reel-from-link] yt-dlp error:", message);
    const isPrivate = /private|login required|not available|unavailable|rate.?limit/i.test(message);
    return NextResponse.json(
      {
        error: isPrivate
          ? "This reel is private or requires login to access."
          : "Could not fetch reel data. Make sure the link is public and try again.",
      },
      { status: 422 }
    );
  }

  // Resolve the handle: uploader_url has the real @handle; uploader is a
  // display name which may contain spaces or emoji — never use it as a handle.
  const username =
    usernameFromUploaderUrl(metadata.uploader_url) ||
    urlUsername;

  const caption = metadata.description ?? "";

  // Transcribe the audio with Whisper so the spoken content goes into the
  // script generator — far more useful than the IG caption text alone.
  let transcript: string | null = null;
  if (metadata.mediaUrl) {
    try {
      const result = await transcribeReel({
        permalink: cleanUrl,
        mediaUrl: metadata.mediaUrl,
      });
      if (result.status === "ready") {
        transcript = result.text;
      } else {
        console.error("[reel-from-link] transcription unavailable:", result.reason);
      }
    } catch (err) {
      // Non-fatal — return what we have without the transcript.
      console.error("[reel-from-link] transcription error:", err);
    }
  }

  return NextResponse.json({
    username,
    caption,
    transcript,
    thumbnail_url: metadata.thumbnail ?? null,
    permalink: cleanUrl,
  });
}
