import type { TranscriptSegment } from "@/lib/transcription/types";

// Formats a number of seconds as an SRT timestamp: HH:MM:SS,mmm
// (note the comma before milliseconds, as the SubRip spec requires).
function formatTimestamp(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const totalMs = Math.round(safe * 1000);

  const ms = totalMs % 1000;
  const totalSeconds = Math.floor(totalMs / 1000);
  const secs = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const mins = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return `${pad(hours)}:${pad(mins)}:${pad(secs)},${pad(ms, 3)}`;
}

// Builds a valid SubRip (.srt) document from timed transcript segments.
// Segments without usable text are skipped; if nothing remains, returns null
// so callers can fall back to storing plain text only.
export function buildSrt(segments: TranscriptSegment[] | null | undefined): string | null {
  if (!segments || segments.length === 0) {
    return null;
  }

  const blocks: string[] = [];
  let index = 1;

  for (const segment of segments) {
    const text = segment.text?.trim();
    if (!text) {
      continue;
    }

    // Guard against zero-length or reversed ranges so players don't choke.
    const start = segment.start;
    const end = segment.end > segment.start ? segment.end : segment.start + 0.5;

    blocks.push(
      `${index}\n${formatTimestamp(start)} --> ${formatTimestamp(end)}\n${text}`
    );
    index += 1;
  }

  if (blocks.length === 0) {
    return null;
  }

  // Trailing newline keeps strict parsers happy.
  return `${blocks.join("\n\n")}\n`;
}
