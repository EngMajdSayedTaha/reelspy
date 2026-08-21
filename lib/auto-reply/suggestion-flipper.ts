// Pure helpers behind the "suggestion flipper" UI (components/automations/
// SuggestionFlipper.tsx) — browsing a curated list of common reply sentences
// and dropping one (or a random icon) into a form field. Kept side-effect
// free so the cycling/selection/insertion logic is unit-testable without a
// DOM.

export type SuggestionApplyMode = "replace" | "append-line";

/** Wraps `current + delta` into `[0, length)`. Used by the prev/next controls. */
export function cycleIndex(current: number, delta: number, length: number): number {
  if (length <= 0) return 0;
  return ((current + delta) % length + length) % length;
}

/** A random index different from `current` (when more than one option exists). */
export function randomOtherIndex(current: number, length: number): number {
  if (length <= 1) return 0;
  let next = current;
  while (next === current) next = Math.floor(Math.random() * length);
  return next;
}

/** Picks a random entry from a non-empty list — the "icon randomizer" button. */
export function pickRandomIcon(icons: string[]): string {
  if (icons.length === 0) return "";
  return icons[Math.floor(Math.random() * icons.length)];
}

/**
 * Applies a picked suggestion to the current field value.
 * - "replace" (single-message fields like the DM/reply text): the suggestion
 *   becomes the new value outright.
 * - "append-line" (rotated multi-template fields like public replies): the
 *   suggestion is added as a new line so it joins the rotation instead of
 *   overwriting what's already there.
 */
export function applySuggestion(value: string, suggestion: string, mode: SuggestionApplyMode): string {
  if (mode === "replace" || !value.trim()) return suggestion;
  return `${value.replace(/\s+$/, "")}\n${suggestion}`;
}

/** Inserts text at a selection range, returning the new value and cursor position. */
export function insertAtSelection(
  value: string,
  insertText: string,
  selectionStart: number | null,
  selectionEnd: number | null
): { text: string; cursor: number } {
  const start = selectionStart ?? value.length;
  const end = selectionEnd ?? value.length;
  const text = value.slice(0, start) + insertText + value.slice(end);
  return { text, cursor: start + insertText.length };
}
