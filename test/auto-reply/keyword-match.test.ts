import { describe, it, expect } from "vitest";
import { matchKeyword } from "@/lib/auto-reply/keyword-match";

describe("matchKeyword — contains (token boundary)", () => {
  it("matches a standalone token, case-insensitively", () => {
    expect(matchKeyword("Send LINK please", ["link"])).toBe("link");
    expect(matchKeyword("link me", ["link"])).toBe("link");
  });

  it("does not match inside a larger word", () => {
    expect(matchKeyword("check my linkedin", ["link"])).toBeNull();
    expect(matchKeyword("blinking lights", ["link"])).toBeNull();
  });

  it("matches next to punctuation and emoji", () => {
    expect(matchKeyword("link!", ["link"])).toBe("link");
    expect(matchKeyword("🔥link🔥", ["link"])).toBe("link");
    expect(matchKeyword("(link)", ["link"])).toBe("link");
  });

  it("matches Arabic keywords at Unicode boundaries", () => {
    expect(matchKeyword("ابغى رابط الآن", ["رابط"])).toBe("رابط");
    expect(matchKeyword("رابط", ["رابط"])).toBe("رابط");
  });

  it("returns the first matching keyword from the list", () => {
    expect(matchKeyword("i want the guide", ["link", "guide", "price"])).toBe("guide");
  });

  it("ignores blank keywords and blank text", () => {
    expect(matchKeyword("link", ["", "  ", "link"])).toBe("link");
    expect(matchKeyword("   ", ["link"])).toBeNull();
    expect(matchKeyword(null, ["link"])).toBeNull();
    expect(matchKeyword(undefined, ["link"])).toBeNull();
  });

  it("treats regex metacharacters in a keyword literally", () => {
    expect(matchKeyword("email a.b please", ["a.b"])).toBe("a.b");
    expect(matchKeyword("email axb please", ["a.b"])).toBeNull();
  });
});

describe("matchKeyword — exact", () => {
  it("requires the whole trimmed comment to equal the keyword", () => {
    expect(matchKeyword("  Link  ", ["link"], "exact")).toBe("link");
    expect(matchKeyword("link please", ["link"], "exact")).toBeNull();
  });
});

describe("matchKeyword — any", () => {
  it("matches any non-empty comment regardless of keywords", () => {
    expect(matchKeyword("literally anything", [], "any")).toBe("*");
    expect(matchKeyword("👍", [], "any")).toBe("*");
  });

  it("still rejects an empty comment", () => {
    expect(matchKeyword("   ", ["x"], "any")).toBeNull();
  });
});
