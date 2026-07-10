// Classification of yt-dlp stderr into actionable kinds, shared by the retry
// logic in lib/media/ytdlp.ts and the user-facing error mappers. Pure module
// (no `server-only`) so vitest can load it directly.

export type YtDlpErrorKind =
  | "authRequired" // needs a logged-in session — retrying with cookies may help
  | "rateLimited" // IP/account throttled — cookies are fine, back off instead
  | "botCheck" // challenge/checkpoint — the session is flagged
  | "unavailable" // gone/removed/never existed — cookies won't help
  | "other";

// Instagram's messages overlap ("rate-limit reached or login required" is a
// single string), so order matters: rate-limit first, then bot challenges,
// then auth. "Requested content is not available" / "not available on this
// app" are what IG returns to LOGGED-OUT clients even for public reels, so
// they classify as authRequired to trigger the cookie retry.
export function classifyYtDlpError(detail: string): YtDlpErrorKind {
  const d = detail.toLowerCase();

  if (/rate.?limit|too many requests|http error 429/.test(d)) {
    return "rateLimited";
  }
  if (/checkpoint|challenge|not a bot|suspicious|http error 403/.test(d)) {
    return "botCheck";
  }
  if (
    /login required|log in|logged.?in|need.* cookies|use --cookies|requested content is not available|not available on this app|empty media response|no video formats|restricted video|18 years old/.test(
      d
    )
  ) {
    return "authRequired";
  }
  if (/unavailable|removed|does not exist|not exist|http error 404|no longer available|private/.test(d)) {
    return "unavailable";
  }
  return "other";
}

// Thrown by getReelMetadata. The message keeps the historical
// "yt-dlp extraction failed: …" prefix so existing string-matching consumers
// (friendlyTranscriptError, pipeline reasons) continue to work.
export class YtDlpExtractionError extends Error {
  readonly kind: YtDlpErrorKind;
  readonly usedCookies: boolean;

  constructor(detail: string, kind: YtDlpErrorKind, usedCookies: boolean) {
    super(`yt-dlp extraction failed: ${detail.slice(0, 400)}`);
    this.name = "YtDlpExtractionError";
    this.kind = kind;
    this.usedCookies = usedCookies;
  }
}
