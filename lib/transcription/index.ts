import { TranscriptionRateLimitError } from "@/lib/transcription/errors";
import { groqProvider } from "@/lib/transcription/groq";
import { huggingfaceProvider } from "@/lib/transcription/huggingface";
import { buildSrt } from "@/lib/transcription/srt";
import type { TranscribeInput, TranscriptResult } from "@/lib/transcription/types";

export { buildSrt } from "@/lib/transcription/srt";
export { TranscriptionRateLimitError } from "@/lib/transcription/errors";
export type {
  TranscribeInput,
  TranscriptResult,
  TranscriptSegment,
  TranscriptStatus,
  TranscriptionSource,
} from "@/lib/transcription/types";

// Whisper engines, tried in order. Both transcribe the audio at a media URL
// (provided upstream by yt-dlp). Groq is primary; Hugging Face is the fallback.
const PROVIDERS = [groqProvider, huggingfaceProvider];

export async function transcribeReel(input: TranscribeInput): Promise<TranscriptResult> {
  const configured = PROVIDERS.filter((provider) => provider.isConfigured());

  if (configured.length === 0) {
    return {
      status: "unavailable",
      reason: "No transcription provider is configured. Set GROQ_API_KEY (or HF_API_TOKEN).",
    };
  }

  if (!input.mediaUrl) {
    return {
      status: "unavailable",
      reason: "No media URL was resolved for this reel, so the audio could not be transcribed.",
    };
  }

  const errors: string[] = [];
  const startedAt = Date.now();

  // A throttle from ANY provider makes the whole attempt retryable, even if the
  // others failed for their own reasons: the throttled one can still succeed on
  // a later pass, so the reel has not been proven untranscribable.
  let retryAfterSeconds: number | null = null;
  let throttled = false;

  for (const provider of configured) {
    try {
      const { text, language, segments } = await provider.transcribe(input);
      return {
        status: "ready",
        text,
        language,
        source: provider.name,
        durationMs: Date.now() - startedAt,
        segments,
        srt: buildSrt(segments),
      };
    } catch (error) {
      if (error instanceof TranscriptionRateLimitError) {
        throttled = true;
        // Keep the longest hint offered — waiting less than a provider asked for
        // just earns another 429.
        if (error.retryAfterSeconds != null) {
          retryAfterSeconds = Math.max(retryAfterSeconds ?? 0, error.retryAfterSeconds);
        }
      }
      const message = error instanceof Error ? error.message : "Unknown error";
      errors.push(`${provider.name}: ${message}`);
    }
  }

  return {
    status: "unavailable",
    reason: errors.join(" | ") || "All transcription providers failed.",
    retryable: throttled,
    retryAfterSeconds,
  };
}
