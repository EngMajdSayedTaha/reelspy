import { extractTranscriptText } from "@/lib/transcription/shared";
import type { TranscriptionProvider } from "@/lib/transcription/types";

// Generic, provider-agnostic fallback that takes a reel PERMALINK and returns a
// transcript. Useful for any service not covered by a dedicated adapter (e.g.
// Subclip) or a RapidAPI-hosted endpoint. Configured entirely via env vars:
//
//   REEL_TRANSCRIPT_API_URL   (required)  POST endpoint
//   REEL_TRANSCRIPT_API_KEY   (optional)  bearer token / RapidAPI key
//   REEL_TRANSCRIPT_API_HOST  (optional)  set for RapidAPI-style hosts

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
    const text = extractTranscriptText(json);
    if (!text) {
      throw new Error("Transcript API returned no usable transcript text.");
    }

    return { text, language: null };
  },
};
