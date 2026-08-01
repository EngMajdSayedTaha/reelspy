// Structured, greppable logging for the OAuth connect flows.
//
// This bug ("connecting Instagram does nothing on my phone") was undiagnosable
// for weeks because the flow failed SILENTLY: every failure path was a redirect,
// redirects don't log, and Vercel's runtime-log retention is short enough that
// by the time it's reported the evidence is gone. Nothing in the database
// distinguished "never tried" from "tried and lost the cookie".
//
// So every decision point in connect/callback now emits one line. Filter the
// Vercel runtime logs on `[oauth]` to get the whole story of an attempt; the
// `step` field says exactly where it ended.
//
// Never log tokens, codes, cookie values or the signed state itself — only
// whether they were present and what the verdict was.

type OAuthLogFields = {
  /** Flow name: "ig" | "tiktok" | "youtube". */
  flow: string;
  /** Where in the flow this line was emitted, e.g. "connect:start". */
  step: string;
  [key: string]: unknown;
};

/**
 * Coarse client class. Enough to tell a phone from a laptop and to spot an
 * embedded WebView (Facebook blocks OAuth inside those, which looks to the user
 * exactly like a page that never finishes loading). Deliberately not a full UA
 * string — that is user-identifying and noisy in logs.
 */
export function clientClass(userAgent: string | null): string {
  if (!userAgent) return "unknown";
  const ua = userAgent.toLowerCase();
  const webview =
    /\bfban\b|\bfbav\b|\bfb_iab\b|instagram|\bline\b|micromessenger|\bwv\b/.test(ua);
  const platform = /iphone|ipad|ipod/.test(ua)
    ? "ios"
    : /android/.test(ua)
      ? "android"
      : /mobile/.test(ua)
        ? "mobile"
        : "desktop";
  return webview ? `${platform}+webview` : platform;
}

export function oauthLog(fields: OAuthLogFields): void {
  const { flow, step, ...rest } = fields;
  console.log(`[oauth] ${flow} ${step}`, JSON.stringify(rest));
}

export function oauthError(fields: OAuthLogFields): void {
  const { flow, step, ...rest } = fields;
  console.error(`[oauth] ${flow} ${step}`, JSON.stringify(rest));
}

/** The request context worth attaching to every line of one attempt. */
export function requestContext(request: Request): Record<string, unknown> {
  const headers = request.headers;
  return {
    client: clientClass(headers.get("user-agent")),
    forwardedHost: headers.get("x-forwarded-host") ?? null,
    host: headers.get("host") ?? null,
  };
}
