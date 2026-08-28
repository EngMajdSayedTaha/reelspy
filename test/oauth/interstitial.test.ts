import { describe, expect, it } from "vitest";
import { renderOAuthInterstitial } from "@/lib/oauth/interstitial";

// The connect route used to answer with a bare 307 to the provider. When the
// browser refuses to load that provider — Brave Shields' Facebook-login/script
// blocking, a content blocker, a filtering DNS, an in-app WebView — the user
// saw a blank screen with no error and nothing to tap, and nothing reached our
// logs either. Production logs for this bug showed five correct redirects to
// Facebook and zero callbacks.
//
// The handoff page has to keep the healthy path instant while making the
// blocked path explain itself.

const AUTHORIZE = "https://www.facebook.com/v23.0/dialog/oauth?client_id=1&state=abc";

describe("renderOAuthInterstitial", () => {
  const html = renderOAuthInterstitial({
    authorizeUrl: AUTHORIZE,
    provider: "Facebook",
    locale: "en",
    flow: "ig",
  });

  it("auto-redirects to the provider so a healthy flow is unchanged", () => {
    expect(html).toContain("window.location.replace(URL_)");
  });

  it("uses replace() so Back from the provider skips this hop", () => {
    expect(html).not.toContain("location.assign");
    expect(html).not.toContain("location.href =");
  });

  it("feeds location.replace() a real URL, not an HTML-escaped one", () => {
    // location.replace() does not decode HTML entities. If the "&" separators
    // were escaped to "&amp;" here (as they must be in the href attribute), the
    // provider would receive "&amp;state=abc" as a bogus parameter name.
    // Facebook tolerates it; Instagram Login rejects the whole request.
    const jsLiteral = html.match(/var URL_ = '([^']*)';/);
    expect(jsLiteral).not.toBeNull();
    expect(jsLiteral![1]).toBe(AUTHORIZE);
    expect(jsLiteral![1]).not.toContain("&amp;");
    // The href attribute, by contrast, MUST stay HTML-escaped.
    expect(html).toContain(`href="${AUTHORIZE.replace(/&/g, "&amp;")}"`);
  });

  it("always renders a tappable manual link, so a no-JS browser is not stranded", () => {
    expect(html).toContain(`href="https://www.facebook.com/v23.0/dialog/oauth?client_id=1&amp;state=abc"`);
    expect(html).toContain("<noscript>");
    expect(html).toContain("http-equiv=\"refresh\"");
  });

  it("shows troubleshooting instead of re-redirecting when the user comes back", () => {
    // The signal that the provider dialog went nowhere: a sessionStorage marker
    // left before departure, plus a bfcache restore.
    expect(html).toContain("sessionStorage.getItem(KEY)");
    expect(html).toContain("if (returned) { showStuck(); return; }");
    expect(html).toContain("event.persisted");
  });

  it("names URL Blocked first — a server-config dead end the user cannot fix", () => {
    // Facebook's "URL Blocked" page never redirects back, so this is the only
    // surface that can tell the user it is our problem, not their browser's.
    expect(html).toContain("URL Blocked");
    expect(html).toContain("server configuration problem on our side");
  });

  it("names the browser-side causes the user can actually act on", () => {
    expect(html).toContain("Brave");
    expect(html).toContain("Allow Facebook logins");
    expect(html.toLowerCase()).toContain("different browser");
    expect(html.toLowerCase()).toContain("in-app browser");
  });

  it("escapes the authorize URL so it cannot break out of the attribute or script", () => {
    const nasty = renderOAuthInterstitial({
      authorizeUrl: "https://evil.test/?x=</script><script>alert('xss')</script>&y='\"",
      provider: "Facebook",
      locale: "en",
      flow: "ig",
    });
    expect(nasty).not.toContain("<script>alert(");
    expect(nasty).not.toContain("</script><script>");
    // The quote characters that would terminate the JS string literal or the
    // href attribute must be entity-encoded.
    expect(nasty).toContain("&#39;");
    expect(nasty).toContain("&quot;");
  });

  it("marks itself noindex — it is a transient redirect page", () => {
    expect(html).toContain('name="robots" content="noindex"');
  });

  it("renders Arabic right-to-left", () => {
    const ar = renderOAuthInterstitial({
      authorizeUrl: AUTHORIZE,
      provider: "Facebook",
      locale: "ar",
      flow: "ig",
    });
    expect(ar).toContain('dir="rtl"');
    expect(ar).toContain('lang="ar"');
    expect(ar).toContain("جارٍ نقلك");
  });

  it("scopes the return marker per flow so parallel connects don't collide", () => {
    const tiktok = renderOAuthInterstitial({
      authorizeUrl: AUTHORIZE,
      provider: "TikTok",
      locale: "en",
      flow: "tiktok",
    });
    expect(html).toContain("reelspy_oauth_attempt_ig");
    expect(tiktok).toContain("reelspy_oauth_attempt_tiktok");
  });
});
