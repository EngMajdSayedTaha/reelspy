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

// The ?transcribe=1 path runs the full yt-dlp + Whisper pipeline (minutes of
// compute per call), so it's restricted to an explicit allowlist of user IDs
// via DIAG_ALLOWED_USER_IDS (comma-separated). Fails CLOSED: if the env var is
// unset, no one can trigger the heavy pipeline through this diagnostic route.
// The cheap metadata-only path stays open to any authenticated user.
function diagTranscribeAllowed(userId: string): boolean {
  const raw = process.env.DIAG_ALLOWED_USER_IDS?.trim();
  if (!raw) return false;
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .includes(userId);
}

// yt-dlp will happily fetch ANY url it's given (including internal/metadata
// endpoints), so only Instagram reel URLs are accepted here.
function isInstagramUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    return host === "instagram.com" || host === "instagr.am" || host.endsWith(".instagram.com");
  } catch {
    return false;
  }
}

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

  if (url && !isInstagramUrl(url)) {
    return NextResponse.json({ error: "Only Instagram URLs are supported." }, { status: 400 });
  }

  if (transcribe && !diagTranscribeAllowed(user.id)) {
    return NextResponse.json(
      { error: "Running the transcription pipeline via diagnostics is restricted." },
      { status: 403 }
    );
  }

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
