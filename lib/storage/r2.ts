// Cloudflare R2 storage for uploaded publish videos.
//
// Why R2 and not Supabase Storage: reel videos routinely exceed Supabase's
// per-file upload ceiling (50 MB on the default/free tier), which surfaced as a
// 413 "payload too large" the moment a real reel was uploaded. R2 has no such
// per-object cap and free egress, and it's S3-compatible so the browser can PUT
// straight to it with a presigned URL — video bytes never touch our server.
//
// We use `aws4fetch` (a tiny SigV4 signer) rather than the full AWS SDK to keep
// the serverless bundle small and cold starts fast.
//
// Required env (set in Vercel + your Cloudflare R2 bucket):
//   R2_ACCOUNT_ID         Cloudflare account id (the R2 endpoint subdomain).
//   R2_ACCESS_KEY_ID      R2 API token Access Key ID.
//   R2_SECRET_ACCESS_KEY  R2 API token Secret Access Key.
//   R2_BUCKET             Bucket name (e.g. "publish-media").
//   R2_PUBLIC_BASE_URL    Optional. A Custom Domain (Cloudflare dashboard → R2
//                         → bucket → Settings → Custom Domains, e.g.
//                         https://media.reelspy.dev) bound to the bucket. TikTok's
//                         Content Posting API (PULL_FROM_URL) requires the video
//                         URL's domain to be verified in the TikTok developer
//                         portal, and the raw <account>.r2.cloudflarestorage.com
//                         S3 API host can never be verified — it isn't a domain
//                         you control DNS for. See docs/BUSINESS-LOGIC.md.
//
//                         Without one, presignTikTokUrl below falls back to a
//                         free alternative: routing TikTok's pull through our
//                         own already-verified app origin instead (see the
//                         "TikTok media proxy" section below and
//                         app/api/publishing/media-proxy/route.ts).
//
// The bucket also needs a CORS rule allowing PUT/GET from the app origin so the
// browser upload's preflight succeeds — see docs/publishing-setup.md.

import { createHmac, timingSafeEqual } from "node:crypto";
import { AwsClient } from "aws4fetch";
import { getSiteUrl } from "@/lib/site";

type R2Config = {
  endpoint: string;
  bucket: string;
  client: AwsClient;
};

// R2 ignores the region but SigV4 requires one; "auto" is what Cloudflare uses.
const R2_REGION = "auto";

let cached: R2Config | null = null;

export function r2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET
  );
}

function getConfig(): R2Config {
  if (cached) return cached;

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(
      "Cloudflare R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET."
    );
  }

  cached = {
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    bucket,
    client: new AwsClient({
      accessKeyId,
      secretAccessKey,
      service: "s3",
      region: R2_REGION,
    }),
  };
  return cached;
}

function objectUrl(config: R2Config, key: string): string {
  // Path-style addressing: <endpoint>/<bucket>/<key>. Each path segment is
  // already URL-safe (uuid + extension), but encode defensively.
  const safeKey = key.split("/").map(encodeURIComponent).join("/");
  return `${config.endpoint}/${config.bucket}/${safeKey}`;
}

// One-time URL the browser PUTs the video to. With query-auth signing only the
// host is signed (not headers), so the browser can send its real Content-Type
// freely — R2 stores it as the object's content type. Returns a fully-signed
// URL that carries no secrets.
export async function presignPutUrl(
  key: string,
  _contentType: string,
  expiresSeconds = 60 * 30
): Promise<string> {
  const config = getConfig();
  const url = new URL(objectUrl(config, key));
  url.searchParams.set("X-Amz-Expires", String(expiresSeconds));

  const signed = await config.client.sign(url.toString(), {
    method: "PUT",
    aws: { signQuery: true },
  });
  return signed.url;
}

// Short-lived URL the platform adapters hand to IG/TikTok/YouTube so they can
// pull the video bytes directly from R2.
export async function presignGetUrl(key: string, expiresSeconds = 60 * 30): Promise<string> {
  const publicBase = process.env.R2_PUBLIC_BASE_URL?.trim();
  if (publicBase) {
    // A Custom Domain serves bucket objects directly over HTTPS — it isn't part
    // of the S3 API and doesn't understand SigV4 query auth, so this is
    // intentionally unsigned. Access control is the unguessable UUID key, same
    // as every other presigned link in this file; expiresSeconds doesn't apply
    // here (kept in the signature so callers don't need a platform-specific
    // branch), so treat R2_PUBLIC_BASE_URL objects as reachable indefinitely.
    const safeKey = key.split("/").map(encodeURIComponent).join("/");
    return `${publicBase.replace(/\/+$/, "")}/${safeKey}`;
  }

  const config = getConfig();
  const url = new URL(objectUrl(config, key));
  url.searchParams.set("X-Amz-Expires", String(expiresSeconds));

  const signed = await config.client.sign(url.toString(), {
    method: "GET",
    aws: { signQuery: true },
  });
  return signed.url;
}

// ── TikTok media proxy ───────────────────────────────────────────────────────
// TikTok's Content Posting API (PULL_FROM_URL) requires the pulled URL's
// domain to be verified in TikTok's developer portal. A Custom Domain
// (R2_PUBLIC_BASE_URL) already satisfies that, same as presignGetUrl above.
// Without one — no Cloudflare-managed DNS zone to prove ownership of, and no
// budget for a new domain — route TikTok specifically through our own
// already-verified app origin (getSiteUrl()) instead, which streams the R2
// object back via app/api/publishing/media-proxy/route.ts. Every other
// platform keeps pulling straight from R2 via presignGetUrl: they have no
// domain-verification requirement, so there's no reason to add a proxy hop
// (and its bandwidth cost) to traffic that already works.

function proxySigningKey(): string | null {
  // Reuses CRON_SECRET (already required, server-only) rather than adding a
  // new secret — same convention as lib/email/digest-token.ts.
  return process.env.CRON_SECRET?.trim() || null;
}

function signProxyPayload(key: string, expiresAt: number, signingKey: string): string {
  return createHmac("sha256", signingKey).update(`${key}:${expiresAt}`).digest("hex");
}

function buildMediaProxyUrl(key: string, expiresSeconds: number): string | null {
  const signingKey = proxySigningKey();
  if (!signingKey) return null;

  const expiresAt = Date.now() + expiresSeconds * 1000;
  const sig = signProxyPayload(key, expiresAt, signingKey);
  const url = new URL(`${getSiteUrl()}/api/publishing/media-proxy`);
  url.searchParams.set("key", key);
  url.searchParams.set("exp", String(expiresAt));
  url.searchParams.set("sig", sig);
  return url.toString();
}

/** Verifies a media-proxy URL's signature and expiry. Used by the proxy route. */
export function verifyMediaProxySignature(key: string, expiresAt: number, sig: string): boolean {
  const signingKey = proxySigningKey();
  if (!signingKey || !Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;

  const expected = Buffer.from(signProxyPayload(key, expiresAt, signingKey));
  const received = Buffer.from(sig);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

/** Direct authenticated fetch — what the proxy route streams back to TikTok. */
export function fetchR2Object(key: string): Promise<Response> {
  const config = getConfig();
  return config.client.fetch(objectUrl(config, key), { method: "GET" });
}

/**
 * URL to hand TikTok specifically. Identical to presignGetUrl when a Custom
 * Domain is configured; otherwise the signed media-proxy URL above, or —
 * lacking even CRON_SECRET to sign one — the same raw R2 URL every other
 * platform gets (TikTok rejects it the same way it does today; not a new
 * failure mode, just today's unconfigured-server behavior preserved).
 */
export async function presignTikTokUrl(key: string, expiresSeconds = 60 * 30): Promise<string> {
  if (process.env.R2_PUBLIC_BASE_URL?.trim()) return presignGetUrl(key, expiresSeconds);
  return buildMediaProxyUrl(key, expiresSeconds) ?? presignGetUrl(key, expiresSeconds);
}

// Best-effort delete of an uploaded object (called when a post is removed).
export async function deleteR2Object(key: string): Promise<void> {
  const config = getConfig();
  const res = await config.client.fetch(objectUrl(config, key), { method: "DELETE" });
  // R2 returns 204 on success and 404 if already gone; neither is an error here.
  if (!res.ok && res.status !== 404) {
    throw new Error(`R2 delete failed (${res.status}).`);
  }
}
