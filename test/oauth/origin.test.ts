import { afterEach, describe, expect, it } from "vitest";
import { checkOAuthOrigin, originOf, requestPublicOrigin } from "@/lib/oauth/origin";

// Regression guard for the "connecting Instagram does nothing on my phone" bug.
//
// reelspy.dev proxies /api/* to this same deployment, so /api/ig/connect could
// run on an origin Facebook never returns to. The state cookie and the Supabase
// session were written there and simply never sent to the callback, which then
// failed as `invalid_state` / no-session and bounced the user between origins.
// The connect route must therefore pin the flow to the callback's own origin
// BEFORE writing any cookie.

const CALLBACK = "https://app.reelspy.dev/api/ig/callback";
const CONNECT = "/api/ig/connect";

function req(url: string, headers: Record<string, string> = {}) {
  return new Request(url, { headers });
}

const originalVercelEnv = process.env.VERCEL_ENV;
afterEach(() => {
  if (originalVercelEnv === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = originalVercelEnv;
});

describe("originOf", () => {
  it("extracts the origin of an absolute URL", () => {
    expect(originOf(CALLBACK)).toBe("https://app.reelspy.dev");
  });

  it("returns null for an unparseable value", () => {
    expect(originOf("/api/ig/callback")).toBeNull();
  });
});

describe("requestPublicOrigin", () => {
  it("prefers x-forwarded-host over the internal host in request.url", () => {
    const origin = requestPublicOrigin(
      req("https://reelspy-one.vercel.app/api/ig/connect", {
        "x-forwarded-host": "reelspy.dev",
        "x-forwarded-proto": "https",
      })
    );
    expect(origin).toBe("https://reelspy.dev");
  });

  it("takes the first entry of a comma-joined forwarded header", () => {
    const origin = requestPublicOrigin(
      req("https://internal.example/api/ig/connect", {
        "x-forwarded-host": "reelspy.dev, internal.example",
        "x-forwarded-proto": "https, http",
      })
    );
    expect(origin).toBe("https://reelspy.dev");
  });

  it("falls back to the Host header", () => {
    const origin = requestPublicOrigin(
      req("https://internal.example/api/ig/connect", { host: "app.reelspy.dev" })
    );
    expect(origin).toBe("https://app.reelspy.dev");
  });

  it("assumes http for localhost so local dev matches its own canonical origin", () => {
    const origin = requestPublicOrigin(
      req("http://localhost:3000/api/ig/connect", { host: "localhost:3000" })
    );
    expect(origin).toBe("http://localhost:3000");
  });
});

describe("checkOAuthOrigin", () => {
  it("pins a request that arrived on the marketing origin to the callback origin", () => {
    const check = checkOAuthOrigin(
      req("https://reelspy-one.vercel.app/api/ig/connect", {
        "x-forwarded-host": "reelspy.dev",
        "x-forwarded-proto": "https",
      }),
      CALLBACK,
      CONNECT
    );
    expect(check.pinned).toBe(true);
    if (!check.pinned) throw new Error("expected pinned");
    expect(check.redirectTo).toBe("https://app.reelspy.dev/api/ig/connect");
  });

  it("pins a request that arrived on the raw *.vercel.app deployment host", () => {
    const check = checkOAuthOrigin(
      req("https://reelspy-one.vercel.app/api/ig/connect", {
        host: "reelspy-one.vercel.app",
      }),
      CALLBACK,
      CONNECT
    );
    expect(check.pinned).toBe(true);
  });

  it("does not pin a request already on the canonical origin", () => {
    const check = checkOAuthOrigin(
      req("https://app.reelspy.dev/api/ig/connect", { host: "app.reelspy.dev" }),
      CALLBACK,
      CONNECT
    );
    expect(check.pinned).toBe(false);
  });

  it("preserves the query string across the bounce so a retry keeps its params", () => {
    const check = checkOAuthOrigin(
      req("https://reelspy.dev/api/ig/connect?retry=1", { host: "reelspy.dev" }),
      CALLBACK,
      CONNECT
    );
    if (!check.pinned) throw new Error("expected pinned");
    expect(check.redirectTo).toBe("https://app.reelspy.dev/api/ig/connect?retry=1");
  });

  it("never pins on preview deployments, whose host cannot be registered with Meta", () => {
    process.env.VERCEL_ENV = "preview";
    const check = checkOAuthOrigin(
      req("https://reelspy-git-branch.vercel.app/api/ig/connect", {
        host: "reelspy-git-branch.vercel.app",
      }),
      CALLBACK,
      CONNECT
    );
    expect(check.pinned).toBe(false);
  });

  it("does not pin when the redirect URI is unparseable — never strand the flow", () => {
    const check = checkOAuthOrigin(
      req("https://reelspy.dev/api/ig/connect", { host: "reelspy.dev" }),
      "not-a-url",
      CONNECT
    );
    expect(check.pinned).toBe(false);
  });

  it("localhost dev matches its own canonical origin and is left alone", () => {
    const check = checkOAuthOrigin(
      req("http://localhost:3000/api/ig/connect", { host: "localhost:3000" }),
      "http://localhost:3000/api/ig/callback",
      CONNECT
    );
    expect(check.pinned).toBe(false);
  });
});
