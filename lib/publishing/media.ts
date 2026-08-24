// Turn a post's stored media rows into the signed, ordered slides an adapter
// can hand to a platform.
//
// Every platform pulls the bytes itself ("PULL_FROM_URL", `video_url`,
// `image_url`, `file_url`), so what an adapter needs is a URL Meta/TikTok can
// actually fetch — which is what presignGetUrl mints. Nothing is stored as a
// URL; signing happens per dispatch so a retried job always gets a fresh one.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { presignGetUrl } from "@/lib/storage/r2";
import type { MediaItemKind, PublishMediaItem } from "./types";

// Long enough for a large upload to transcode on the platform's side (Instagram
// polls for minutes on a big reel), short enough that a leaked URL goes stale.
// Note: when R2_PUBLIC_BASE_URL is set, presignGetUrl returns an unsigned custom
// -domain URL and this TTL does not apply — see lib/storage/r2.ts.
const SIGNED_URL_TTL_SECONDS = 60 * 45;

export type MediaRow = {
  position: number;
  kind: MediaItemKind;
  storage_path: string;
  mime_type: string;
  alt_text: string | null;
};

/**
 * Load a post's slides, in order, each with a fetchable URL.
 *
 * Falls back to `publish_posts.video_path` when a post has no publish_media
 * rows — posts created before the media table existed are backfilled by
 * migration 20260822021155, but a post created by an older deploy that is still
 * mid-flight would not be, and silently publishing nothing is worse than
 * publishing the video it actually has.
 */
export async function loadPublishMedia(
  admin: SupabaseClient,
  postId: string,
  legacyVideoPath: string | null
): Promise<PublishMediaItem[]> {
  const { data, error } = await admin
    .from("publish_media")
    .select("position, kind, storage_path, mime_type, alt_text")
    .eq("post_id", postId)
    .order("position", { ascending: true })
    .returns<MediaRow[]>();

  if (error) throw new Error(`Could not load the post's media: ${error.message}`);

  const rows: MediaRow[] =
    data && data.length > 0
      ? data
      : legacyVideoPath
        ? [
            {
              position: 0,
              kind: "video",
              storage_path: legacyVideoPath,
              mime_type: "video/mp4",
              alt_text: null,
            },
          ]
        : [];

  if (rows.length === 0) throw new Error("This post has no media to publish.");

  return Promise.all(
    rows.map(async (row, index) => ({
      // Re-index from the sorted rows so a gap in `position` (a deleted slide)
      // can't hand an adapter a cover index that points past the end.
      position: index,
      kind: row.kind,
      url: await presignGetUrl(row.storage_path, SIGNED_URL_TTL_SECONDS),
      mimeType: row.mime_type,
      altText: row.alt_text,
    }))
  );
}

/** Every R2 object a post owns — used to clean up on delete. */
export async function listPublishMediaPaths(
  admin: SupabaseClient,
  postId: string,
  legacyVideoPath: string | null
): Promise<string[]> {
  const { data } = await admin
    .from("publish_media")
    .select("storage_path")
    .eq("post_id", postId)
    .returns<{ storage_path: string }[]>();

  const paths = new Set<string>();
  for (const row of data ?? []) paths.add(row.storage_path);
  if (legacyVideoPath) paths.add(legacyVideoPath);
  return [...paths];
}
