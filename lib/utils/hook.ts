// Derives the "hook" (scroll-stopping opener) from a reel transcript: the first
// non-empty line, trimmed to its first sentence, capped at a sane length.
export function extractHook(transcript: string | null | undefined): string | null {
  if (!transcript) return null;

  const trimmed = transcript.trim();
  if (!trimmed) return null;

  const firstLine =
    trimmed
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? trimmed;

  // Cut at the first sentence boundary so hooks stay punchy.
  const firstSentence = firstLine.split(/(?<=[.!?])\s/)[0] ?? firstLine;

  const words = firstSentence.split(/\s+/);
  if (words.length > 18) {
    return `${words.slice(0, 18).join(" ")}…`;
  }
  return firstSentence;
}
