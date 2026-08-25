import { fetchR2Object, verifyMediaProxySignature } from "@/lib/storage/r2";

// Streams an R2 object back on our own domain. TikTok's Content Posting API
// (PULL_FROM_URL) requires the pulled URL's host to be domain-verified, which
// the raw R2 S3 endpoint can never be — see lib/storage/r2.ts (presignTikTokUrl)
// for why this route exists and how its key/exp/sig triple is minted.
//
// Unauthenticated by design: the signature IS the auth, same trust model as
// the raw presigned R2 URL it replaces (an unguessable, time-boxed link).
// Reachable without a session because /api is excluded from middleware.ts's
// auth check on purpose — same as the cron and webhook routes.
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key") ?? "";
  const exp = Number(url.searchParams.get("exp") ?? "");
  const sig = url.searchParams.get("sig") ?? "";

  if (!key || !sig || !verifyMediaProxySignature(key, exp, sig)) {
    return Response.json({ error: "Invalid or expired link." }, { status: 403 });
  }

  const upstream = await fetchR2Object(key);
  if (!upstream.ok || !upstream.body) {
    return Response.json(
      { error: "Media not found." },
      { status: upstream.status === 404 ? 404 : 502 }
    );
  }

  const headers = new Headers();
  const contentType = upstream.headers.get("content-type");
  const contentLength = upstream.headers.get("content-length");
  if (contentType) headers.set("Content-Type", contentType);
  if (contentLength) headers.set("Content-Length", contentLength);
  // One-time signed link — nothing in between should cache it.
  headers.set("Cache-Control", "private, no-store");

  return new Response(upstream.body, { status: 200, headers });
}
