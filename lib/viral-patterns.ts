// Canonical list of viral content patterns, shared across AI pattern detection,
// the feed filter, and script generation.
export const VIRAL_PATTERNS = [
  "Hot Take",
  "Mistake List",
  "Tool Reveal",
  "Before/After",
  "Story",
  "Step-by-Step",
  "Unpopular Opinion",
] as const;

export type ViralPattern = (typeof VIRAL_PATTERNS)[number];

export function isViralPattern(value: unknown): value is ViralPattern {
  return typeof value === "string" && (VIRAL_PATTERNS as readonly string[]).includes(value);
}
