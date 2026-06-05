import type { TranscriptionProvider } from "@/lib/transcription/types";

// Generic, provider-agnostic fallback that takes a reel PERMALINK and returns a
// transcript. Many free services (often via RapidAPI) follow this shape. The
// concrete endpoint/key are configured through env vars so the provider can be
// swapped without code changes:
//
//   REEL_TRANSCRIPT_API_URL   (required)  POST endpoint
//   REEL_TRANSCRIPT_API_KEY   (optional)  bearer token / RapidAPI key
//   REEL_TRANSCRIPT_API_HOST  (optional)  set for RapidAPI-style hosts
//
// This is the primary working path in production, because Business-Discovery
// reels do not expose a downloadable video for the audio-based providers.

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

// Best-effort extraction of a transcript string from an unknown JSON shape.
function extractTranscript(payload: unknown): string | null {
  if (typeof payload === "string") {
    return payload.trim() || null;
  }
  if (!isRecord(payload)) {
    return null;
  }

  const directKeys = ["transcript", "text", "result", "transcription", "caption"];
  for (const key of directKeys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  // Nested shapes: { data: ... } / { transcript: { text } } / segment arrays.
  if (isRecord(payload.data)) {
    const nested = extractTranscript(payload.data);
    if (nested) return nested;
  }
  if (Array.isArray(payload.segments)) {
    const joined = payload.segments
      .map((segment) => (isRecord(segment) && typeof segment.text === "string" ? segment.text : ""))
      .join(" ")
      .trim();
    if (joined) return joined;
  }

  return null;
}

export const thirdpartyProvider: TranscriptionProvider = {
  name: "thirdparty",
  requiresMedia: false,
  isConfigured: () => Boolean(process.env.REEL_TRANSCRIPT_API_URL),

  async transcribe({ permalink }) {
    const endpoint = process.env.REEL_TRANSCRIPT_API_URL;
    if (!endpoint) {
      throw new Error("REEL_TRANSCRIPT_API_URL is not set.");
    }

    const apiKey = process.env.REEL_TRANSCRIPT_API_KEY;
    const apiHost = process.env.REEL_TRANSCRIPT_API_HOST;

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiHost && apiKey) {
      // RapidAPI-style authentication.
      headers["x-rapidapi-host"] = apiHost;
      headers["x-rapidapi-key"] = apiKey;
    } else if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ url: permalink, permalink }),
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Transcript API error (${response.status}): ${body.slice(0, 200)}`);
    }

    const json = (await response.json()) as unknown;
    const text = extractTranscript(json);
    if (!text) {
      throw new Error("Transcript API returned no usable transcript text.");
    }

    return { text, language: null };
  },
};
