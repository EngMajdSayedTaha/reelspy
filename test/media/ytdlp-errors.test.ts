import { describe, expect, it } from "vitest";
import { classifyYtDlpError, YtDlpExtractionError } from "@/lib/media/ytdlp-errors";

// Real-world yt-dlp stderr samples for Instagram — the classifier drives the
// cookie retry (authRequired/rateLimited/botCheck retry with cookies) and the
// "mark session dead" decision (authRequired/botCheck on an authenticated run).
describe("classifyYtDlpError", () => {
  it("classifies login-required errors as authRequired", () => {
    expect(classifyYtDlpError("ERROR: [Instagram] DExample: login required")).toBe("authRequired");
    expect(
      classifyYtDlpError("You need to log in to access this content. Use --cookies for authentication")
    ).toBe("authRequired");
  });

  it("classifies Instagram's logged-out 'content not available' phrasings as authRequired", () => {
    // IG returns these for PUBLIC reels when the client isn't logged in, so
    // they must trigger the cookie retry rather than count as "unavailable".
    expect(
      classifyYtDlpError("ERROR: [Instagram] ABC123: Requested content is not available")
    ).toBe("authRequired");
    expect(
      classifyYtDlpError("The following content is not available on this app.")
    ).toBe("authRequired");
  });

  it("classifies rate-limit errors as rateLimited, even when the message mentions cookies", () => {
    expect(
      classifyYtDlpError(
        "Requested content is not available, rate-limit reached or login required. Use --cookies"
      )
    ).toBe("rateLimited");
    expect(classifyYtDlpError("HTTP Error 429: Too Many Requests")).toBe("rateLimited");
  });

  it("classifies challenges and 403s as botCheck", () => {
    expect(classifyYtDlpError("checkpoint_required: challenge needed")).toBe("botCheck");
    expect(classifyYtDlpError("HTTP Error 403: Forbidden")).toBe("botCheck");
  });

  it("classifies removed/missing content as unavailable", () => {
    expect(classifyYtDlpError("ERROR: This video is unavailable")).toBe("unavailable");
    expect(classifyYtDlpError("HTTP Error 404: Not Found")).toBe("unavailable");
    expect(classifyYtDlpError("This account is private")).toBe("unavailable");
  });

  it("falls back to other for generic failures", () => {
    expect(classifyYtDlpError("getaddrinfo ENOTFOUND www.instagram.com")).toBe("other");
    expect(classifyYtDlpError("Command failed with exit code 1")).toBe("other");
  });
});

describe("YtDlpExtractionError", () => {
  it("keeps the historical message prefix and carries classification", () => {
    const err = new YtDlpExtractionError("login required", "authRequired", true);
    expect(err.message).toBe("yt-dlp extraction failed: login required");
    expect(err.kind).toBe("authRequired");
    expect(err.usedCookies).toBe(true);
  });

  it("truncates very long stderr", () => {
    const err = new YtDlpExtractionError("x".repeat(1000), "other", false);
    expect(err.message.length).toBeLessThanOrEqual("yt-dlp extraction failed: ".length + 400);
  });
});
