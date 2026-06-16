import type { TranscriptionProvider } from "@/lib/transcription/types";

// Groq hosts whisper-large-v3 with a generous free tier and very low latency.
// It exposes an OpenAI-compatible audio transcription endpoint, so we POST the
// downloaded media as multipart form data.
const GROQ_TRANSCRIBE_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const GROQ_MODEL = "whisper-large-v3";

type GroqSegment = {
  start?: number;
  end?: number;
  text?: string;
};

type GroqTranscriptionResponse = {
  text?: string;
  language?: string;
  segments?: GroqSegment[];
};

export const groqProvider: TranscriptionProvider = {
  name: "groq",
  requiresMedia: true,
  isConfigured: () => Boolean(process.env.GROQ_API_KEY),

  async transcribe({ mediaUrl }) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error("GROQ_API_KEY is not set.");
    }
    if (!mediaUrl) {
      throw new Error("Groq provider requires a downloadable media URL.");
    }

    const media = await fetch(mediaUrl, { cache: "no-store" });
    if (!media.ok) {
      throw new Error(`Failed to download reel media (${media.status}).`);
    }
    const blob = await media.blob();

    const form = new FormData();
    form.append("file", blob, "reel.mp4");
    form.append("model", GROQ_MODEL);
    form.append("response_format", "verbose_json");

    const response = await fetch(GROQ_TRANSCRIBE_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    if (!response.ok) {
      const body = await response.text();
      if (response.status === 413) {
        const mb = (blob.size / (1024 * 1024)).toFixed(1);
        throw new Error(
          `Groq rejected the audio as too large (${mb} MB > 25 MB free-tier limit). The reel may be too long.`
        );
      }
      throw new Error(`Groq API error (${response.status}): ${body.slice(0, 200)}`);
    }

    const json = (await response.json()) as GroqTranscriptionResponse;
    const text = json.text?.trim();
    if (!text) {
      throw new Error("Groq returned an empty transcript.");
    }

    // verbose_json includes per-segment timings, which we turn into an .srt file.
    const segments =
      json.segments
        ?.map((segment) => ({
          start: typeof segment.start === "number" ? segment.start : 0,
          end: typeof segment.end === "number" ? segment.end : 0,
          text: segment.text?.trim() ?? "",
        }))
        .filter((segment) => segment.text.length > 0) ?? null;

    return {
      text,
      language: json.language?.trim() || null,
      segments: segments && segments.length > 0 ? segments : null,
    };
  },
};
