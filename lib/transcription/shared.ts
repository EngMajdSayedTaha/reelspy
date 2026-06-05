// Shared helpers for transcript providers.

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type UnknownRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

const TEXT_KEYS = ["transcript", "text", "transcription", "content", "result", "caption"];
const ARRAY_KEYS = ["transcript", "segments", "results", "sentences", "transcription_segments"];
const NESTED_KEYS = ["data", "result", "output", "transcription"];

// Best-effort extraction of a transcript string from an unknown JSON shape:
// a plain string, a direct text field, an array of { text } segments, or one
// level of nesting. Bounded recursion keeps it safe against odd payloads.
export function extractTranscriptText(payload: unknown, depth = 0): string | null {
  if (typeof payload === "string") {
    return payload.trim() || null;
  }
  if (!isRecord(payload) || depth > 3) {
    return null;
  }

  for (const key of TEXT_KEYS) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  for (const key of ARRAY_KEYS) {
    const arr = payload[key];
    if (Array.isArray(arr)) {
      const joined = arr
        .map((item) => (isRecord(item) && typeof item.text === "string" ? item.text : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (joined) {
        return joined;
      }
    }
  }

  for (const key of NESTED_KEYS) {
    if (key in payload) {
      const nested = extractTranscriptText(payload[key], depth + 1);
      if (nested) {
        return nested;
      }
    }
  }

  return null;
}
