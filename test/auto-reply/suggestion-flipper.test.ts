import { describe, it, expect, vi, afterEach } from "vitest";
import {
  cycleIndex,
  randomOtherIndex,
  pickRandomIcon,
  applySuggestion,
  insertAtSelection,
} from "@/lib/auto-reply/suggestion-flipper";

describe("cycleIndex", () => {
  it("wraps forward past the end", () => {
    expect(cycleIndex(2, 1, 3)).toBe(0);
  });

  it("wraps backward past the start", () => {
    expect(cycleIndex(0, -1, 3)).toBe(2);
  });

  it("returns 0 for an empty list", () => {
    expect(cycleIndex(0, 1, 0)).toBe(0);
  });
});

describe("randomOtherIndex", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 0 when there is nothing else to pick", () => {
    expect(randomOtherIndex(0, 1)).toBe(0);
    expect(randomOtherIndex(0, 0)).toBe(0);
  });

  it("never returns the current index when alternatives exist", () => {
    // Force Math.random() to first "land" on the current index, then move on —
    // proves the loop actually rejects a same-index draw instead of trusting luck.
    const sequence = [0, 0, 0.9];
    vi.spyOn(Math, "random").mockImplementation(() => sequence.shift() ?? 0.9);
    expect(randomOtherIndex(0, 3)).toBe(2);
  });
});

describe("pickRandomIcon", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns an empty string for an empty list", () => {
    expect(pickRandomIcon([])).toBe("");
  });

  it("picks the icon at the random index", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    expect(pickRandomIcon(["👇", "🔗", "📩", "✨"])).toBe("📩");
  });
});

describe("applySuggestion", () => {
  it("replaces the value in replace mode", () => {
    expect(applySuggestion("old text", "new text", "replace")).toBe("new text");
  });

  it("appends as a new line in append-line mode when the field has content", () => {
    expect(applySuggestion("Check your DMs 📩", "Sent! Go check your messages 👀", "append-line")).toBe(
      "Check your DMs 📩\nSent! Go check your messages 👀"
    );
  });

  it("trims trailing whitespace before appending", () => {
    expect(applySuggestion("first line \n", "second line", "append-line")).toBe("first line\nsecond line");
  });

  it("falls back to a plain replace when the field is empty", () => {
    expect(applySuggestion("   ", "new text", "append-line")).toBe("new text");
  });
});

describe("insertAtSelection", () => {
  it("inserts at the given cursor position", () => {
    const result = insertAtSelection("Hello !", "world", 6, 6);
    expect(result).toEqual({ text: "Hello world!", cursor: 11 });
  });

  it("replaces a selected range", () => {
    const result = insertAtSelection("Hello world!", "there", 6, 11);
    expect(result).toEqual({ text: "Hello there!", cursor: 11 });
  });

  it("falls back to appending at the end when selection is unknown", () => {
    const result = insertAtSelection("Hello", " 👋", null, null);
    expect(result).toEqual({ text: "Hello 👋", cursor: "Hello 👋".length });
  });
});
