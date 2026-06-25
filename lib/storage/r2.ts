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
//
// The bucket also needs a CORS rule allowing PUT/GET from the app origin so the
// browser upload's preflight succeeds — see docs/publishing-setup.md.

import { AwsClient } from "aws4fetch";

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
  const config = getConfig();
  const url = new URL(objectUrl(config, key));
  url.searchParams.set("X-Amz-Expires", String(expiresSeconds));

  const signed = await config.client.sign(url.toString(), {
    method: "GET",
    aws: { signQuery: true },
  });
  return signed.url;
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
