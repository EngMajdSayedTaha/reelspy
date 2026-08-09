// Transcription failures that are "not now" rather than "not ever".
//
// The distinction is load-bearing. Every other provider error marks the reel
// `failed`, which is terminal — nothing retries it. That is correct for a reel
// with no audio or one Instagram has removed, and wrong for a 429, where the
// only thing that happened is that we asked too fast. Bulk transcription of an
// account's whole history is precisely the workload that reaches a provider's
// per-minute or per-day ceiling, so treating that ceiling as terminal would
// silently burn most of a large account on the first throttle and leave the
// user with a half-transcribed archive nothing will ever finish.

export class TranscriptionRateLimitError extends Error {
  // From the provider's Retry-After header when it sends one. Advisory: callers
  // may use it to schedule a retry, and must cope with it being absent.
  readonly retryAfterSeconds: number | null;

  constructor(message: string, retryAfterSeconds?: number | null) {
    super(message);
    this.name = "TranscriptionRateLimitError";
    this.retryAfterSeconds =
      retryAfterSeconds != null && Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? retryAfterSeconds
        : null;
  }
}

// Retry-After is either a delay in seconds or an HTTP date; both are legal and
// providers use both. Anything unparseable is simply "no hint".
export function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;

  const seconds = Number(header.trim());
  if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds);

  const when = Date.parse(header);
  if (Number.isFinite(when)) {
    const delta = Math.ceil((when - Date.now()) / 1000);
    return delta > 0 ? delta : null;
  }
  return null;
}
