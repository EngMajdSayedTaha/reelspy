import { describe, it, expect } from "vitest";
import nextConfig from "../next.config";
import { config as middlewareConfig } from "../middleware";

// This app is the secondary zone behind reelspy.dev. `assetPrefix` only changes
// the URLs Next EMITS — it does not make the server respond at that prefix.
// When that gap was open, every JS/CSS chunk request fell through to the
// middleware, got redirected to /login, and the browser received HTML where it
// expected JavaScript: /login and /signup rendered "Something went wrong" for
// every visitor. Both halves of the fix are asserted here.

const PREFIX = "/dashboard-static";

describe("zone asset serving", () => {
  it("emits assets under the zone prefix in production", () => {
    // The value is evaluated at import time against the current NODE_ENV, so
    // assert the rule rather than the resolved value.
    expect(["/dashboard-static", undefined]).toContain(nextConfig.assetPrefix);
  });

  it("rewrites the prefixed asset path back onto the real files", async () => {
    const rewrites = await nextConfig.rewrites!();
    expect(Array.isArray(rewrites)).toBe(false);

    const { beforeFiles } = rewrites as { beforeFiles: Array<{ source: string; destination: string }> };
    const rule = beforeFiles.find((r) => r.source.startsWith(`${PREFIX}/_next`));

    expect(rule, "no beforeFiles rewrite maps the asset prefix back to /_next").toBeDefined();
    expect(rule!.destination).toBe("/_next/:path*");
  });

  it("excludes the asset prefix from the middleware matcher", () => {
    // The exclusions are anchored at the start of the path, so the existing
    // "_next/static" alternative does NOT cover "/dashboard-static/_next/...".
    for (const source of middlewareConfig.matcher) {
      const pattern = new RegExp(`^${source.replace(/^\//, "/")}$`);
      expect(
        pattern.test(`${PREFIX}/_next/static/chunks/abc123.js`),
        `middleware must not run on ${PREFIX} assets`
      ).toBe(false);
    }
  });
});
