import { groqProvider } from "@/lib/transcription/groq";
import { huggingfaceProvider } from "@/lib/transcription/huggingface";
import { buildSrt } from "@/lib/transcription/srt";
import type { TranscribeInput, TranscriptResult } from "@/lib/transcription/types";

export { buildSrt } from "@/lib/transcription/srt";
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
      const message = error instanceof Error ? error.message : "Unknown error";
      errors.push(`${provider.name}: ${message}`);
    }
  }

  return {
    status: "unavailable",
    reason: errors.join(" | ") || "All transcription providers failed.",
  };
}
