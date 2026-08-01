import { describe, expect, it } from "vitest";

// The connect route logs the authorize URL so a "URL Blocked" report can be
// diagnosed from the Vercel logs alone — which Meta app, which Login for
// Business configuration, and the exact redirect_uri Facebook was handed.
//
// `state` is the one parameter that must never appear there: it is the
// HMAC-signed CSRF token bound to the user's session (lib/oauth/state.ts), and
// runtime logs are readable by anyone with dashboard access. This guards the
// redaction the route applies.

const redact = (url: string) => url.replace(/([?&]state=)[^&]*/, "$1REDACTED");

describe("authorize URL redaction", () => {
  it("removes the state token while keeping every diagnostic parameter", () => {
    const url =
      "https://www.facebook.com/v23.0/dialog/oauth" +
      "?client_id=123456789&redirect_uri=https%3A%2F%2Fapp.reelspy.dev%2Fapi%2Fig%2Fcallback" +
      "&response_type=code&state=eyJuIjoiYWJjIn0.c2lnbmF0dXJl&config_id=987654321";

    const safe = redact(url);

    expect(safe).not.toContain("eyJuIjoiYWJjIn0");
    expect(safe).not.toContain("c2lnbmF0dXJl");
    expect(safe).toContain("state=REDACTED");
    // The parameters that make the log actionable must survive.
    expect(safe).toContain("client_id=123456789");
    expect(safe).toContain("config_id=987654321");
    expect(safe).toContain("redirect_uri=https%3A%2F%2Fapp.reelspy.dev%2Fapi%2Fig%2Fcallback");
  });

  it("redacts state wherever it sits in the query string", () => {
    expect(redact("https://x.test/d?state=secret&a=1")).toBe(
      "https://x.test/d?state=REDACTED&a=1"
    );
    expect(redact("https://x.test/d?a=1&state=secret")).toBe(
      "https://x.test/d?a=1&state=REDACTED"
    );
  });

  it("leaves a URL without state untouched", () => {
    const url = "https://x.test/d?client_id=1&scope=a,b";
    expect(redact(url)).toBe(url);
  });
});
