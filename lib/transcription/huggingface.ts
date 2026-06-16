import type { TranscriptionProvider } from "@/lib/transcription/types";

// Hugging Face Inference API exposes whisper-large-v3 on a free tier. It accepts
// raw audio bytes in the request body. Used as a secondary audio-based provider.
const HF_MODEL_URL = "https://api-inference.huggingface.co/models/openai/whisper-large-v3";

type HuggingFaceChunk = {
  // [start, end] in seconds; end may be null on the final chunk.
  timestamp?: [number | null, number | null];
  text?: string;
};

type HuggingFaceResponse = {
  text?: string;
  chunks?: HuggingFaceChunk[];
  error?: string;
};

export const huggingfaceProvider: TranscriptionProvider = {
  name: "huggingface",
  requiresMedia: true,
  isConfigured: () => Boolean(process.env.HF_API_TOKEN),

  async transcribe({ mediaUrl }) {
    const token = process.env.HF_API_TOKEN;
    if (!token) {
      throw new Error("HF_API_TOKEN is not set.");
    }
    if (!mediaUrl) {
      throw new Error("Hugging Face provider requires a downloadable media URL.");
    }

    const media = await fetch(mediaUrl, { cache: "no-store" });
    if (!media.ok) {
      throw new Error(`Failed to download reel media (${media.status}).`);
    }
    const bytes = await media.arrayBuffer();

    const response = await fetch(HF_MODEL_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "audio/mpeg",
      },
      body: bytes,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Hugging Face API error (${response.status}): ${body.slice(0, 200)}`);
    }

    const json = (await response.json()) as HuggingFaceResponse;
    if (json.error) {
      throw new Error(`Hugging Face error: ${json.error}`);
    }
    const text = json.text?.trim();
    if (!text) {
      throw new Error("Hugging Face returned an empty transcript.");
    }

    // Whisper on HF returns timed chunks when timestamps are available; map
    // them so we can build an .srt. Otherwise we degrade to text-only.
    const segments =
      json.chunks
        ?.map((chunk) => ({
          start: typeof chunk.timestamp?.[0] === "number" ? chunk.timestamp[0] : 0,
          end: typeof chunk.timestamp?.[1] === "number" ? chunk.timestamp[1] : 0,
          text: chunk.text?.trim() ?? "",
        }))
        .filter((segment) => segment.text.length > 0) ?? null;

    return {
      text,
      language: null,
      segments: segments && segments.length > 0 ? segments : null,
    };
  },
};
