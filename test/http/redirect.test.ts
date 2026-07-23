import { describe, expect, it } from "vitest";
import { relativeRedirect } from "@/lib/http/redirect";

// Regression guard for the reelspy.dev → dashboard proxy host-leak: every
// user-facing auth redirect must emit a RELATIVE Location so the browser stays
// on the public origin it came in on (reelspy.dev), instead of the internal
// deployment host that request.url carries under the marketing-zone proxy.
describe("relativeRedirect", () => {
  it("emits a relative Location from a path string", () => {
    const res = relativeRedirect("/dashboard");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("/dashboard");
  });

  it("preserves the query string on a path", () => {
    const res = relativeRedirect("/login?error=missing_code&reason=x");
    expect(res.headers.get("location")).toBe("/login?error=missing_code&reason=x");
  });

  it("keeps only pathname + search when given a URL, discarding the origin", () => {
    // Simulates `new URL(path, request.url)` where request.url carries the
    // internal host under the proxy. The origin must NOT survive into Location.
    const url = new URL("/dashboard?tab=feed", "https://reelspy-one.vercel.app");
    const res = relativeRedirect(url);
    const location = res.headers.get("location")!;
    expect(location).toBe("/dashboard?tab=feed");
    expect(location).not.toContain("reelspy-one.vercel.app");
    expect(location.startsWith("/")).toBe(true);
  });

  it("never emits an absolute or protocol-relative Location", () => {
    for (const evil of ["https://evil.com/x", "//evil.com/x", "http://reelspy-one.vercel.app"]) {
      const location = relativeRedirect(evil).headers.get("location")!;
      expect(location.startsWith("//")).toBe(false);
      expect(location).not.toMatch(/^https?:/);
      // Falls back to a safe in-app path rather than honoring the open redirect.
      expect(location).toBe("/dashboard");
    }
  });

  it("supports a 303 status for POST → GET redirects", () => {
    expect(relativeRedirect("/x", 303).status).toBe(303);
  });
});
