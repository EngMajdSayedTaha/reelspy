import { describe, expect, it } from "vitest";
import { decodeB64Cookies, validateNetscapeCookies } from "@/lib/media/cookie-format";

const FUTURE = Math.floor(Date.now() / 1000) + 90 * 86400;
const PAST = Math.floor(Date.now() / 1000) - 86400;

function cookieLine(name: string, value: string, expiry = FUTURE, domain = ".instagram.com") {
  return [domain, "TRUE", "/", "TRUE", String(expiry), name, value].join("\t");
}

const VALID_FILE = [
  "# Netscape HTTP Cookie File",
  "# https://curl.se/docs/http-cookies.html",
  "",
  cookieLine("csrftoken", "abc123"),
  cookieLine("mid", "xyz"),
  `#HttpOnly_${cookieLine("sessionid", "12345%3Atoken%3A27")}`,
].join("\n");

describe("validateNetscapeCookies", () => {
  it("accepts a valid export with a sessionid (including #HttpOnly_ lines)", () => {
    const v = validateNetscapeCookies(VALID_FILE);
    expect(v.ok).toBe(true);
    expect(v.problems).toEqual([]);
    expect(v.cookieCount).toBe(3);
    expect(v.hasSessionId).toBe(true);
    expect(v.sessionIdExpiresAt).not.toBeNull();
  });

  it("rejects a file without a sessionid cookie", () => {
    const v = validateNetscapeCookies([cookieLine("csrftoken", "abc")].join("\n"));
    expect(v.ok).toBe(false);
    expect(v.hasSessionId).toBe(false);
    expect(v.problems.join(" ")).toMatch(/sessionid/);
  });

  it("rejects an expired sessionid with a clear message", () => {
    const v = validateNetscapeCookies(cookieLine("sessionid", "dead", PAST));
    expect(v.ok).toBe(false);
    expect(v.problems.join(" ")).toMatch(/expired/);
  });

  it("rejects JSON-format cookie exports with format guidance", () => {
    const v = validateNetscapeCookies('[{"name":"sessionid","value":"x"}]');
    expect(v.ok).toBe(false);
    expect(v.problems.join(" ")).toMatch(/Netscape/);
  });

  it("rejects empty and cookie-less files", () => {
    expect(validateNetscapeCookies("").ok).toBe(false);
    expect(validateNetscapeCookies("# just a header\n").ok).toBe(false);
  });

  it("flags malformed rows", () => {
    const v = validateNetscapeCookies([cookieLine("sessionid", "x"), "not\ta\tcookie"].join("\n"));
    expect(v.ok).toBe(false);
    expect(v.problems.join(" ")).toMatch(/not valid Netscape/);
  });

  it("only counts a sessionid on an instagram.com domain", () => {
    const v = validateNetscapeCookies(cookieLine("sessionid", "x", FUTURE, ".example.com"));
    expect(v.hasSessionId).toBe(false);
  });
});

describe("decodeB64Cookies", () => {
  it("round-trips a valid encoding", () => {
    const b64 = Buffer.from(VALID_FILE, "utf8").toString("base64");
    expect(decodeB64Cookies(b64)).toBe(VALID_FILE);
  });

  it("rejects garbage that Buffer.from would silently mangle", () => {
    expect(decodeB64Cookies("not!!valid@@base64##")).toBeNull();
    expect(decodeB64Cookies("")).toBeNull();
    expect(decodeB64Cookies("   ")).toBeNull();
  });
});
