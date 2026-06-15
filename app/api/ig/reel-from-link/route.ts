import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getReelMetadata, YtDlpUnavailableError } from "@/lib/media/ytdlp";
import { transcribeReel } from "@/lib/transcription";

export const runtime = "nodejs";
export const maxDuration = 300;

const IG_URL_RE = /instagram\.com\/(?:[a-z0-9._]{1,30}\/)?(?:reel|reels|p)\/([A-Za-z0-9_-]+)/i;

const bodySchema = z.object({
  url: z.string().url().max(500),
});

function cleanIgUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return `${u.origin}${u.pathname}`;
  } catch {
    return raw;
  }
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

  if (!metadata.mediaUrl) {
    return NextResponse.json(
      { error: "Could not resolve a media URL for this reel." },
      { status: 422 }
    );
  }

  const result = await transcribeReel({ permalink: cleanUrl, mediaUrl: metadata.mediaUrl });

  if (result.status !== "ready") {
    console.error("[reel-from-link] transcription failed:", result.reason);
    return NextResponse.json(
      { error: "Could not transcribe this reel. Make sure the link is public and try again." },
      { status: 422 }
    );
  }

  return NextResponse.json({ transcript: result.text });
}
