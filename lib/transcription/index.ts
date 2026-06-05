import { groqProvider } from "@/lib/transcription/groq";
import { huggingfaceProvider } from "@/lib/transcription/huggingface";
import { thirdpartyProvider } from "@/lib/transcription/thirdparty";
import type { TranscribeInput, TranscriptResult } from "@/lib/transcription/types";

export type {
  TranscribeInput,
  TranscriptResult,
  TranscriptStatus,
  TranscriptionSource,
} from "@/lib/transcription/types";

// Providers are tried in order. Audio-based Whisper providers come first (best
// accuracy when a real video is available); the permalink-based third-party
// provider is the resilient fallback.
const PROVIDERS = [groqProvider, huggingfaceProvider, thirdpartyProvider];

export async function transcribeReel(input: TranscribeInput): Promise<TranscriptResult> {
  const configured = PROVIDERS.filter((provider) => provider.isConfigured());

  if (configured.length === 0) {
    return {
      status: "unavailable",
      reason:
        "No transcription provider is configured. Set GROQ_API_KEY, HF_API_TOKEN, or REEL_TRANSCRIPT_API_URL.",
    };
  }

  // Skip audio-based providers when there is no downloadable media for this reel.
  const applicable = configured.filter(
    (provider) => !provider.requiresMedia || Boolean(input.mediaUrl)
  );

  if (applicable.length === 0) {
    return {
      status: "unavailable",
      reason:
        "Only audio-based providers are configured, but this reel has no downloadable video. Set REEL_TRANSCRIPT_API_URL to transcribe directly from the reel link.",
    };
  }

  const errors: string[] = [];
  const startedAt = Date.now();

  for (const provider of applicable) {
    try {
      const { text, language } = await provider.transcribe(input);
      return {
        status: "ready",
        text,
        language,
        source: provider.name,
        durationMs: Date.now() - startedAt,
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
