import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processReel } from "@/lib/media/pipeline";
import { getReelMetadata, probeYtDlp } from "@/lib/media/ytdlp";

// Post-deploy diagnostics for the transcript pipeline. Auth-gated.
//   GET /api/reels/diag                     -> env + yt-dlp binary health
//   GET /api/reels/diag?url=<reel>          -> also resolve metadata/media URL
//   GET /api/reels/diag?url=<reel>&transcribe=1 -> also run the full pipeline
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");
  const transcribe = searchParams.get("transcribe") === "1";

  const ytdlp = await probeYtDlp();

  const whisper = {
    groq: Boolean(process.env.GROQ_API_KEY),
    huggingface: Boolean(process.env.HF_API_TOKEN),
  };

  const response: Record<string, unknown> = { ytdlp, whisper };

  if (url) {
    if (transcribe) {
      const result = await processReel(url);
      response.reel =
        result.status === "ready"
          ? {
              status: "ready",
              source: result.source,
              language: result.language,
              durationSec: result.metadata.durationSec,
              mediaResolved: Boolean(result.metadata.mediaUrl),
              transcriptPreview: result.text.slice(0, 240),
              transcriptChars: result.text.length,
            }
          : { status: "unavailable", reason: result.reason, durationSec: result.metadata?.durationSec ?? null };
    } else {
      try {
        const metadata = await getReelMetadata(url);
        response.reel = {
          status: "metadata-only",
          mediaResolved: Boolean(metadata.mediaUrl),
          durationSec: metadata.durationSec,
          uploader: metadata.uploader,
          hasThumbnail: Boolean(metadata.thumbnail),
        };
      } catch (error) {
        response.reel = {
          status: "error",
          reason: error instanceof Error ? error.message : "metadata extraction failed",
        };
      }
    }
  }

  return NextResponse.json(response);
}
