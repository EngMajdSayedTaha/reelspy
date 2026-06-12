// Pure keyword matcher — no I/O, unit-testable.

import type { MatchMode } from "./types";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Returns the first keyword that matches the comment text, or null.
//
// `contains` requires the keyword to appear as a standalone token — "link"
// matches "send LINK please" but not "linkedin" — using Unicode-aware
// boundaries so keywords next to emoji/Arabic/punctuation still match.
// `exact` requires the whole (trimmed) comment to equal the keyword.
export function matchKeyword(
  text: string | null | undefined,
  keywords: string[],
  mode: MatchMode = "contains"
): string | null {
  const haystack = (text ?? "").trim().toLowerCase();
  if (!haystack) return null;

  for (const raw of keywords) {
    const keyword = raw.trim().toLowerCase();
    if (!keyword) continue;

    if (mode === "exact") {
      if (haystack === keyword) return keyword;
      continue;
    }

    const boundary = "[^\\p{L}\\p{N}_]";
    const pattern = new RegExp(
      `(?:^|${boundary})${escapeRegExp(keyword)}(?:$|${boundary})`,
      "u"
    );
    if (pattern.test(haystack)) return keyword;
  }

  return null;
}
