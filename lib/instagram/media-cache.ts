// Permanent fix for expiring Instagram CDN links (see snapshots.ts): the
// signed URLs Meta hands back for avatars/thumbnails expire in ~7 days, and
// once a reel falls out of Business Discovery's "recent media" window there
// is no API call left that can ever re-fetch its URL. Downloading the bytes
// once and serving them from our own public Storage bucket makes the image
// permanent regardless of what Instagram does with the source media later.
import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "ig-media";
const MAX_BYTES = 10 * 1024 * 1024;

// A URL already served from our bucket needs no re-fetch — the image behind
// it (a specific reel's thumbnail) never changes after the reel is posted, so
// re-downloading it on every sync would just burn bandwidth for the same bytes.
export function isSelfHosted(url: string | null | undefined): boolean {
  return !!url && url.includes(`/storage/v1/object/public/${BUCKET}/`);
}

// Downloads `sourceUrl` and stores it at `path` in the shared public bucket,
// returning our permanent URL. Returns null on any failure so callers can
// fall back to the (still valid, just temporary) source URL instead of
// breaking the image entirely.
export async function cacheImage(
  admin: SupabaseClient,
  sourceUrl: string,
  path: string
): Promise<string | null> {
  try {
    const res = await fetch(sourceUrl, { headers: { "user-agent": "Mozilla/5.0" } });
    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    if (!contentType.startsWith("image/")) return null;

    const contentLength = Number(res.headers.get("content-length") ?? 0);
    if (contentLength > MAX_BYTES) return null;

    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.byteLength > MAX_BYTES) return null;

    const { error } = await admin.storage.from(BUCKET).upload(path, bytes, {
      contentType,
      upsert: true,
      cacheControl: "31536000",
    });
    if (error) return null;

    return admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  } catch {
    return null;
  }
}
