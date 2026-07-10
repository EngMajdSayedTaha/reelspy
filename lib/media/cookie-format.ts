// Netscape cookies.txt validation for the Instagram session used by yt-dlp.
// Pure module (no `server-only`) so vitest can load it directly. Never logs or
// returns cookie VALUES — only structural facts about the file.

export type CookieValidation = {
  ok: boolean;
  problems: string[];
  cookieCount: number;
  hasSessionId: boolean;
  // Netscape column 5 is a unix expiry (0 = session cookie). Instagram's
  // sessionid usually carries ~1 year; surfacing it helps the admin route
  // report how long the pasted session nominally lasts.
  sessionIdExpiresAt: string | null;
};

// Base64 decode with a round-trip check: Buffer.from(b64, "base64") silently
// swallows garbage, so re-encode and compare to catch corrupted pastes.
export function decodeB64Cookies(b64: string): string | null {
  const trimmed = b64.trim();
  if (!trimmed) return null;
  try {
    const buf = Buffer.from(trimmed, "base64");
    if (buf.length === 0) return null;
    const normalized = trimmed.replace(/=+$/, "");
    if (buf.toString("base64").replace(/=+$/, "") !== normalized) return null;
    return buf.toString("utf8");
  } catch {
    return null;
  }
}

// A cookie line is 7 tab-separated fields:
//   domain  includeSubdomains  path  secure  expiry  name  value
// Curl/extension exports may prefix HttpOnly cookies with "#HttpOnly_".
export function validateNetscapeCookies(decoded: string): CookieValidation {
  const problems: string[] = [];
  let cookieCount = 0;
  let hasSessionId = false;
  let sessionIdExpiresAt: string | null = null;
  let malformedLines = 0;

  const trimmed = decoded.trim();
  if (!trimmed) {
    return {
      ok: false,
      problems: ["File is empty."],
      cookieCount: 0,
      hasSessionId: false,
      sessionIdExpiresAt: null,
    };
  }
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    return {
      ok: false,
      problems: [
        "This looks like a JSON cookie export. yt-dlp needs the Netscape cookies.txt format — use a 'Get cookies.txt' style browser extension.",
      ],
      cookieCount: 0,
      hasSessionId: false,
      sessionIdExpiresAt: null,
    };
  }

  const nowSec = Math.floor(Date.now() / 1000);

  for (const rawLine of decoded.split("\n")) {
    let line = rawLine.replace(/\r$/, "");
    if (line.startsWith("#HttpOnly_")) {
      line = line.slice("#HttpOnly_".length);
    } else if (!line.trim() || line.startsWith("#")) {
      continue; // header comment or blank line
    }

    const fields = line.split("\t");
    if (fields.length !== 7) {
      malformedLines += 1;
      continue;
    }

    cookieCount += 1;
    const [domain, , , , expiry, name] = fields;

    if (name === "sessionid" && domain.toLowerCase().endsWith("instagram.com")) {
      hasSessionId = true;
      const expirySec = Number(expiry);
      if (Number.isFinite(expirySec) && expirySec > 0) {
        if (expirySec <= nowSec) {
          hasSessionId = false;
          problems.push(
            "The sessionid cookie is already expired — export a fresh cookies.txt while logged in."
          );
        } else {
          sessionIdExpiresAt = new Date(expirySec * 1000).toISOString();
        }
      }
    }
  }

  if (cookieCount === 0) {
    problems.push("No cookie lines found — expected tab-separated Netscape cookies.txt format.");
  } else if (malformedLines > 0) {
    problems.push(`${malformedLines} line(s) are not valid Netscape cookie rows.`);
  }
  if (cookieCount > 0 && !hasSessionId && !problems.some((p) => p.includes("expired"))) {
    problems.push(
      "No Instagram sessionid cookie found — export while logged in to Instagram, or the cookies won't authenticate."
    );
  }

  return {
    ok: problems.length === 0 && hasSessionId,
    problems,
    cookieCount,
    hasSessionId,
    sessionIdExpiresAt,
  };
}
