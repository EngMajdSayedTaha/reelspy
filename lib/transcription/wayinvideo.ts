import { extractTranscriptText, isRecord, sleep } from "@/lib/transcription/shared";
import type { TranscriptionProvider } from "@/lib/transcription/types";

// WayinVideo Video Transcription API (v2). Asynchronous: POST a transcript job
// for a video URL, then poll the results endpoint until it succeeds.
//   Docs: https://wayin.ai/api-docs/video-transcription/
const WAYIN_BASE = "https://wayinvideo-api.wayin.ai/api/v2";
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 90_000;

type WayinCreateResponse = {
  data?: { project_id?: string; status?: string };
};

export const wayinvideoProvider: TranscriptionProvider = {
  name: "wayinvideo",
  requiresMedia: false,
  isConfigured: () => Boolean(process.env.WAYINVIDEO_API_KEY),

  async transcribe({ permalink }) {
    const apiKey = process.env.WAYINVIDEO_API_KEY;
    if (!apiKey) {
      throw new Error("WAYINVIDEO_API_KEY is not set.");
    }

    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "x-wayinvideo-api-version": "v2",
    };

    const createResponse = await fetch(`${WAYIN_BASE}/transcripts`, {
      method: "POST",
      headers,
      body: JSON.stringify({ video_url: permalink, target_lang: "en" }),
      cache: "no-store",
    });
    if (!createResponse.ok) {
      const body = await createResponse.text();
      throw new Error(`WayinVideo create error (${createResponse.status}): ${body.slice(0, 200)}`);
    }

    const createJson = (await createResponse.json()) as WayinCreateResponse;
    const projectId = createJson.data?.project_id;
    if (!projectId) {
      throw new Error("WayinVideo did not return a project_id.");
    }

    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);

      const resultResponse = await fetch(`${WAYIN_BASE}/transcripts/results/${projectId}`, {
        headers,
        cache: "no-store",
      });
      if (!resultResponse.ok) {
        // Transient while the job spins up; keep polling on 404/5xx.
        if (resultResponse.status === 404 || resultResponse.status >= 500) {
          continue;
        }
        const body = await resultResponse.text();
        throw new Error(`WayinVideo results error (${resultResponse.status}): ${body.slice(0, 200)}`);
      }

      const resultJson = (await resultResponse.json()) as { data?: unknown };
      const data = resultJson.data;
      const status =
        isRecord(data) && typeof data.status === "string" ? data.status.toUpperCase() : "";

      if (status === "FAILED" || status === "ERROR") {
        throw new Error("WayinVideo transcription failed.");
      }

      if (status === "SUCCEEDED" || status === "SUCCESS" || status === "COMPLETED") {
        const text = extractTranscriptText(data);
        if (!text) {
          throw new Error("WayinVideo returned an empty transcript.");
        }
        return { text, language: null };
      }
      // CREATED / PROCESSING / RUNNING — keep polling.
    }

    throw new Error("WayinVideo transcription timed out.");
  },
};
