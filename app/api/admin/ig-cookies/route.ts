import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import { decodeB64Cookies, validateNetscapeCookies } from "@/lib/media/cookie-format";
import { getIgCookieStatus, saveIgCookies } from "@/lib/media/ig-cookies";
import { probeYtDlp, testCandidateCookies } from "@/lib/media/ytdlp";
import { cronAuthorized } from "@/lib/utils/cron";

// Rotate the Instagram session cookies used by the transcript pipeline WITHOUT
// a Vercel redeploy: validates the pasted cookies.txt, optionally live-tests
// them with a real extraction (on Vercel's actual egress IPs, which is what
// matters — cookies that work from a laptop can still be challenged from a
// datacenter), then stores them in app_settings. See docs/ig-cookies-runbook.md.
//
//   GET  /api/admin/ig-cookies  -> cookie status + yt-dlp probe (no secrets)
//   POST /api/admin/ig-cookies  -> { cookies_b64, live_test? } store new cookies
//
// Normally driven by scripts/update-ig-cookies.mjs.
export const runtime = "nodejs";
export const maxDuration = 120; // live test runs yt-dlp

const bodySchema = z.object({
  cookies_b64: z.string().min(1).max(200_000),
  live_test: z.boolean().optional().default(true),
});

// Two ways in, both fail closed: the CRON_SECRET bearer token the founder's
// local script uses, or a browser admin — who must come through the full admin
// gate, meaning an UNLOCKED panel and (for the POST, which replaces the session
// cookies the whole scraping pipeline runs on) a freshly re-entered admin
// passphrase. Checking `is_admin` alone here would have left a hole straight
// past the step-up gate to the product's most sensitive stored credential.
async function authorized(
  request: Request
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  if (cronAuthorized(request)) return { ok: true };
  const gate = await requireAdmin(request);
  if (gate.ok) return { ok: true };
  return { ok: false, response: gate.response };
}

export async function GET(request: Request) {
  const auth = await authorized(request);
  if (!auth.ok) return auth.response;
  const [status, ytdlp] = await Promise.all([getIgCookieStatus(), probeYtDlp()]);
  return NextResponse.json({ cookies: status, ytdlp });
}

export async function POST(request: Request) {
  const auth = await authorized(request);
  if (!auth.ok) return auth.response;

  const rawBody = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Expected { cookies_b64: string, live_test?: boolean }." },
      { status: 400 }
    );
  }

  const decoded = decodeB64Cookies(parsed.data.cookies_b64);
  if (!decoded) {
    return NextResponse.json(
      { error: "cookies_b64 is not valid base64.", problems: ["Encode with: base64 -w0 cookies.txt"] },
      { status: 400 }
    );
  }

  const validation = validateNetscapeCookies(decoded);
  if (!validation.ok) {
    return NextResponse.json(
      {
        error: "Cookie file failed validation — nothing was stored.",
        problems: validation.problems,
        cookieCount: validation.cookieCount,
      },
      { status: 400 }
    );
  }

  // Live-test the CANDIDATE before it replaces a possibly-working session.
  const testUrl = process.env.IG_HEALTHCHECK_REEL_URL?.trim();
  let liveTested = false;
  if (parsed.data.live_test && testUrl) {
    const test = await testCandidateCookies(parsed.data.cookies_b64, testUrl);
    if (!test.ok) {
      return NextResponse.json(
        { error: "Live test with the new cookies failed — nothing was stored.", detail: test.error },
        { status: 422 }
      );
    }
    liveTested = true;
  }

  await saveIgCookies(parsed.data.cookies_b64, "admin-api");

  return NextResponse.json({
    ok: true,
    cookieCount: validation.cookieCount,
    sessionIdExpiresAt: validation.sessionIdExpiresAt,
    liveTested,
  });
}
