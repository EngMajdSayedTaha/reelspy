// Permanent fix for expiring Instagram CDN links (see snapshots.ts): the
// signed URLs Meta hands back for avatars/thumbnails expire in ~7 days, and
// once a reel falls out of Business Discovery's "recent media" window there
// is no API call left that can ever re-fetch its URL. Downloading the bytes
// once and serving them from our own public Storage bucket makes the image
// permanent regardless of what Instagram does with the source media later.
import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";

const BUCKET = "ig-media";
const MAX_BYTES = 10 * 1024 * 1024;

// Thumbnails/avatars are only ever displayed as small card/profile previews,
// never at source resolution, so there is no reason to store Instagram's
// full-size JPEG (often 1080px+ per side, several hundred KB) byte for byte.
// Capping the longer side at 480px and re-encoding keeps every image sharp at
// any card size the app actually renders while cutting typical file size by
// roughly 80%.
const THUMBNAIL_MAX_DIMENSION = 480;
const THUMBNAIL_JPEG_QUALITY = 74;

// Video gets its own, larger ceiling: a 30-second reel is comfortably past the
// 10MB image limit, and rejecting it there would silently mirror nothing.
// Still bounded — this runs against someone else's CDN on a cron, and an
// unbounded download is how one pathological file stalls the whole pass.
const MAX_VIDEO_BYTES = 40 * 1024 * 1024;

// A URL already served from our bucket needs no re-fetch — the image behind
// it (a specific reel's thumbnail) never changes after the reel is posted, so
// re-downloading it on every sync would just burn bandwidth for the same bytes.
export function isSelfHosted(url: string | null | undefined): boolean {
  return !!url && url.includes(`/storage/v1/object/public/${BUCKET}/`);
}

// Downloads `sourceUrl` and stores it at `path` in the shared public bucket,
// returning our permanent URL. Returns null on any failure so callers can
// fall back to the (still valid, just temporary) source URL instead of
// breaking the media entirely.
async function cacheMedia(
  admin: SupabaseClient,
  sourceUrl: string,
  path: string,
  kind: "image" | "video"
): Promise<string | null> {
  const maxBytes = kind === "video" ? MAX_VIDEO_BYTES : MAX_BYTES;
  const fallbackType = kind === "video" ? "video/mp4" : "image/jpeg";
  try {
    const res = await fetch(sourceUrl, { headers: { "user-agent": "Mozilla/5.0" } });
    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") ?? fallbackType;
    if (!contentType.startsWith(`${kind}/`)) return null;

    const contentLength = Number(res.headers.get("content-length") ?? 0);
    if (contentLength > maxBytes) return null;

    let bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.byteLength > maxBytes) return null;

    let outContentType = contentType;
    if (kind === "image") {
      // Best-effort: a source image sharp can't parse (corrupt, unsupported
      // format) still caches fine at its original size rather than failing
      // the whole mirror over a cosmetic optimization.
      try {
        bytes = await sharp(bytes)
          .resize({
            width: THUMBNAIL_MAX_DIMENSION,
            height: THUMBNAIL_MAX_DIMENSION,
            fit: "inside",
            withoutEnlargement: true,
          })
          .jpeg({ quality: THUMBNAIL_JPEG_QUALITY })
          .toBuffer();
        outContentType = "image/jpeg";
      } catch {
        // fall through with the original bytes/contentType
      }
    }

    const { error } = await admin.storage.from(BUCKET).upload(path, bytes, {
      contentType: outContentType,
      upsert: true,
      cacheControl: "31536000",
    });
    if (error) return null;

    return admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  } catch {
    return null;
  }
}

export function cacheImage(
  admin: SupabaseClient,
  sourceUrl: string,
  path: string
): Promise<string | null> {
  return cacheMedia(admin, sourceUrl, path, "image");
}

// Mirrors a reel's mp4. Deliberately NOT called from the sync path: a video is
// three orders of magnitude larger than a thumbnail, and every user's sync
// pulling one for every reel they track would be an enormous bandwidth and
// storage bill for bytes nobody looks at. Only the public showcase needs
// video, so only the showcase mirror cron (app/api/cron/mirror-reel-videos)
// calls this — a few dozen files, not tens of thousands.
export function cacheVideo(
  admin: SupabaseClient,
  sourceUrl: string,
  path: string
): Promise<string | null> {
  return cacheMedia(admin, sourceUrl, path, "video");
}
