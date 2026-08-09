import { describe, it, expect, afterEach, vi } from "vitest";
import { parseRetryAfter, TranscriptionRateLimitError } from "@/lib/transcription/errors";
import { groqProvider } from "@/lib/transcription/groq";
import { transcribeReel } from "@/lib/transcription";

// A provider saying "too fast" and a provider saying "this reel can't be
// transcribed" look almost identical at the HTTP layer and mean opposite things
// downstream: one reschedules, the other marks the reel permanently failed.
// Bulk transcription of a whole account is what makes the first case common, so
// these tests pin the classification rather than the plumbing around it.

const OLD_ENV = { ...process.env };

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...OLD_ENV };
});

// Groq downloads the media before calling Whisper, so a stub has to answer both.
function stubFetch(transcription: { status: number; headers?: Record<string, string> }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown) => {
      if (String(url).includes("api.groq.com")) {
        return {
          ok: transcription.status < 400,
          status: transcription.status,
          headers: new Headers(transcription.headers ?? {}),
          text: async () => "rate limit reached for whisper-large-v3",
          json: async () => ({ text: "hello" }),
        };
      }
      // A real Blob, not a shape: the provider hands this straight to
      // FormData.append, which rejects anything that isn't one.
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        blob: async () => new Blob([new Uint8Array(1024)]),
        arrayBuffer: async () => new ArrayBuffer(1024),
      };
    })
  );
}

describe("parseRetryAfter", () => {
  it("reads a delay in seconds", () => {
    expect(parseRetryAfter("30")).toBe(30);
  });

  it("reads an HTTP date as a delay from now", () => {
    const when = new Date(Date.now() + 45_000).toUTCString();
    const parsed = parseRetryAfter(when);
    expect(parsed).toBeGreaterThan(0);
    expect(parsed).toBeLessThanOrEqual(46);
  });

  // A header already in the past would otherwise become a negative or zero wait,
  // which reads as "retry immediately" — the one thing a throttle rules out.
  it("ignores absent, unparseable, and past values", () => {
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter("soon")).toBeNull();
    expect(parseRetryAfter("0")).toBeNull();
    expect(parseRetryAfter(new Date(Date.now() - 60_000).toUTCString())).toBeNull();
  });
});

describe("groq provider error classification", () => {
  it("throws a rate-limit error on 429, carrying the Retry-After hint", async () => {
    process.env.GROQ_API_KEY = "test-key";
    stubFetch({ status: 429, headers: { "retry-after": "60" } });

    const error = await groqProvider
      .transcribe({ permalink: "https://instagram.com/reel/x", mediaUrl: "https://cdn/x.mp4" })
      .then(() => null)
      .catch((err: unknown) => err);

    expect(error).toBeInstanceOf(TranscriptionRateLimitError);
    expect((error as TranscriptionRateLimitError).retryAfterSeconds).toBe(60);
  });

  it("throws a rate-limit error on 503, which is Groq shedding load", async () => {
    process.env.GROQ_API_KEY = "test-key";
    stubFetch({ status: 503 });

    const error = await groqProvider
      .transcribe({ permalink: "https://instagram.com/reel/x", mediaUrl: "https://cdn/x.mp4" })
      .then(() => null)
      .catch((err: unknown) => err);

    expect(error).toBeInstanceOf(TranscriptionRateLimitError);
  });

  // 400 is Groq rejecting THIS audio. Retrying it forever would be pointless, so
  // it must stay an ordinary (terminal) error.
  it("throws an ordinary error for a genuine rejection", async () => {
    process.env.GROQ_API_KEY = "test-key";
    stubFetch({ status: 400 });

    const error = await groqProvider
      .transcribe({ permalink: "https://instagram.com/reel/x", mediaUrl: "https://cdn/x.mp4" })
      .then(() => null)
      .catch((err: unknown) => err);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(TranscriptionRateLimitError);
  });
});

describe("transcribeReel", () => {
  it("marks the result retryable when a provider was throttled", async () => {
    process.env.GROQ_API_KEY = "test-key";
    delete process.env.HF_API_TOKEN;
    stubFetch({ status: 429, headers: { "retry-after": "90" } });

    const result = await transcribeReel({
      permalink: "https://instagram.com/reel/x",
      mediaUrl: "https://cdn/x.mp4",
    });

    expect(result.status).toBe("unavailable");
    if (result.status === "unavailable") {
      expect(result.retryable).toBe(true);
      expect(result.retryAfterSeconds).toBe(90);
    }
  });

  it("leaves a genuine failure non-retryable", async () => {
    process.env.GROQ_API_KEY = "test-key";
    delete process.env.HF_API_TOKEN;
    stubFetch({ status: 400 });

    const result = await transcribeReel({
      permalink: "https://instagram.com/reel/x",
      mediaUrl: "https://cdn/x.mp4",
    });

    expect(result.status).toBe("unavailable");
    if (result.status === "unavailable") {
      expect(result.retryable).toBe(false);
    }
  });

  // Nothing was attempted, so there is nothing to come back for — a missing
  // media URL is a property of the reel, not of how fast we asked.
  it("does not mark a missing media URL retryable", async () => {
    process.env.GROQ_API_KEY = "test-key";

    const result = await transcribeReel({ permalink: "https://instagram.com/reel/x" });

    expect(result.status).toBe("unavailable");
    if (result.status === "unavailable") {
      expect(result.retryable ?? false).toBe(false);
    }
  });
});
