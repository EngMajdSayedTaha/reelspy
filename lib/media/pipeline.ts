import { getReelMetadata, YtDlpUnavailableError, type ReelMetadata } from "@/lib/media/ytdlp";
import { transcribeReel } from "@/lib/transcription";

export type ReelTranscriptionResult =
  | {
      status: "ready";
      text: string;
      language: string | null;
      source: string;
      srt: string | null;
      metadata: ReelMetadata;
    }
  | {
      status: "unavailable";
      reason: string;
      metadata: ReelMetadata | null;
    };

// End-to-end: extract reel metadata + direct media URL with yt-dlp (no binary
// download), then transcribe the audio with Whisper (Groq). Never throws —
// failures are returned as a typed "unavailable" result.
export async function processReel(permalink: string): Promise<ReelTranscriptionResult> {
  let metadata: ReelMetadata;
  try {
    metadata = await getReelMetadata(permalink);
  } catch (error) {
    const reason =
      error instanceof YtDlpUnavailableError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Failed to read reel metadata.";
    return { status: "unavailable", reason, metadata: null };
  }

  if (!metadata.mediaUrl) {
    return {
      status: "unavailable",
      reason: "Could not resolve a media URL for this reel (it may be private or need cookies).",
      metadata,
    };
  }

  const result = await transcribeReel({ permalink, mediaUrl: metadata.mediaUrl });
  if (result.status !== "ready") {
    return { status: "unavailable", reason: result.reason, metadata };
  }

  return {
    status: "ready",
    text: result.text,
    language: result.language,
    source: result.source,
    srt: result.srt,
    metadata,
  };
}
