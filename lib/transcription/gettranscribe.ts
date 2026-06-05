import { sleep } from "@/lib/transcription/shared";
import type { TranscriptionProvider } from "@/lib/transcription/types";

// GetTranscribe API. Creating a transcription from a video URL usually returns
// the full transcript synchronously in the `transcription` field; if it comes
// back without text (async), poll the get-by-id endpoint until it's ready.
//   Docs: https://www.gettranscribe.ai/api-documentation/
const GT_BASE = "https://api.gettranscribe.ai";
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 90_000;

type GetTranscribeRecord = {
  id?: number | string;
  transcription?: string;
  status?: string;
};

function readTranscript(json: GetTranscribeRecord): string | null {
  return typeof json.transcription === "string" && json.transcription.trim()
    ? json.transcription.trim()
    : null;
}

export const gettranscribeProvider: TranscriptionProvider = {
  name: "gettranscribe",
  requiresMedia: false,
  isConfigured: () => Boolean(process.env.GETTRANSCRIBE_API_KEY),

  async transcribe({ permalink }) {
    const apiKey = process.env.GETTRANSCRIBE_API_KEY;
    if (!apiKey) {
      throw new Error("GETTRANSCRIBE_API_KEY is not set.");
    }

    const headers = {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    };

    const createResponse = await fetch(`${GT_BASE}/transcriptions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ url: permalink, model: "fast" }),
      cache: "no-store",
    });
    if (!createResponse.ok) {
      const body = await createResponse.text();
      throw new Error(`GetTranscribe create error (${createResponse.status}): ${body.slice(0, 200)}`);
    }

    const createJson = (await createResponse.json()) as GetTranscribeRecord;
    const direct = readTranscript(createJson);
    if (direct) {
      return { text: direct, language: null };
    }

    const id = createJson.id;
    if (id === undefined || id === null) {
      throw new Error("GetTranscribe returned no transcript or id.");
    }

    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);

      const getResponse = await fetch(`${GT_BASE}/transcriptions/${id}`, {
        headers,
        cache: "no-store",
      });
      if (!getResponse.ok) {
        if (getResponse.status >= 500) {
          continue;
        }
        const body = await getResponse.text();
        throw new Error(`GetTranscribe get error (${getResponse.status}): ${body.slice(0, 200)}`);
      }

      const getJson = (await getResponse.json()) as GetTranscribeRecord;
      const text = readTranscript(getJson);
      if (text) {
        return { text, language: null };
      }

      const status = (getJson.status ?? "").toLowerCase();
      if (status === "failed" || status === "error") {
        throw new Error("GetTranscribe transcription failed.");
      }
    }

    throw new Error("GetTranscribe transcription timed out.");
  },
};
