// Mirrors the mp4s behind the public reel wall on reelspy.dev.
//
// The landing page plays a reel whenever /api/public/trending hands it a
// self-hosted video URL, and shows the still otherwise. This is what promotes
// a handful of URLs from "Instagram's signed link, expires in about a week"
// to "ours, permanent" — the same two-stage lifecycle thumbnails already have
// (lib/instagram/media-cache), just applied to a deliberately tiny subset.
//
// Tiny is the whole design. ig_reel_snapshots holds tens of thousands of rows
// and every one now carries a video_url, but mirroring all of them would mean
// hundreds of gigabytes of storage and egress for bytes nobody ever requests:
// the dashboard never plays video, and only the marketing wall does. So this
// walks exactly the reels the wall can actually show — the same seed-pool
// query, the same niches, the same ranking the public endpoint uses — and
// stops at a hard per-run cap.

import type { SupabaseClient } from "@supabase/supabase-js";
import { cacheVideo, isSelfHosted } from "./media-cache";
import { seedTrending } from "@/lib/trends/niche";
import { SHOWCASE_NICHES, SHOWCASE_LIMIT } from "@/lib/trends/public-showcase";

// Matches the public endpoint's own lookback so this mirrors the same window
// the wall renders from. A reel outside it can't appear, so mirroring it would
// be pure waste.
const DAYS = 21;

// Ceiling per run. Each item is a full download-and-re-upload of a file up to
// 40MB against someone else's CDN, inside a function with a 300s budget that
// is already doing a snapshot refresh and a seed-enrichment pass. The backlog
// is small and self-limiting: once a niche's top reels are mirrored they stay
// mirrored, so steady-state runs only pick up what newly entered the top
// eight. Sized to clear everything the public landing page actually shows
// (3 niches × SHOWCASE_LIMIT) in a single run, still comfortably inside the
// time budget alongside the other work in the same request.
const MAX_PER_RUN = 24;

// Ceiling on files removed per run. Listing is oldest-first and every run
// deletes what it lists, so a backlog drains over successive runs.
const MAX_PRUNE_PER_RUN = 100;

export type MirrorResult = {
  scanned: number;
  mirrored: number;
  failed: number;
  alreadyMirrored: number;
  /** Stale mirrored videos deleted from Storage this run. */
  pruned: number;
  /** Stopped early because the caller's time budget ran out. */
  timedOut?: boolean;
};

/**
 * Promotes showcase reel videos into the public `ig-media` bucket.
 *
 * Fails soft throughout: a video we cannot fetch (expired signature, deleted
 * post, an oversized file) is simply left alone, and the card keeps showing
 * its still. Nothing here is allowed to fail the cron it rides on.
 */
export async function mirrorShowcaseVideos(
  admin: SupabaseClient,
  opts: { deadline?: number } = {}
): Promise<MirrorResult> {
  const result: MirrorResult = { scanned: 0, mirrored: 0, failed: 0, alreadyMirrored: 0, pruned: 0 };

  // Free the space before spending it: an mp4 is ~10MB and the free-tier
  // bucket cap is small, so reclaim videos the wall can no longer show first.
  try {
    result.pruned = await pruneStaleShowcaseVideos(admin);
  } catch (err) {
    console.warn("[showcase-video] prune failed", err);
  }

  // Deduped across niches: a reel can rank in more than one, and downloading
  // the same file twice in a run would spend the cap on nothing.
  const seen = new Set<string>();
  const candidates: { mediaId: string; username: string; videoUrl: string }[] = [];

  for (const niche of SHOWCASE_NICHES) {
    if (candidates.length >= MAX_PER_RUN) break;
    let reels;
    try {
      reels = await seedTrending(admin, { niche, days: DAYS, limit: SHOWCASE_LIMIT });
    } catch (err) {
      console.warn("[showcase-video] seedTrending failed", { niche, err });
      continue;
    }

    for (const reel of reels) {
      result.scanned += 1;
      if (!reel.videoUrl) continue;
      if (isSelfHosted(reel.videoUrl)) {
        result.alreadyMirrored += 1;
        continue;
      }
      // seedTrending returns the public shape, which has no media id on it —
      // the permalink's shortcode is the stable per-reel key available here.
      const mediaId = mediaKeyFor(reel.permalink);
      if (!mediaId || seen.has(mediaId)) continue;
      seen.add(mediaId);
      candidates.push({ mediaId, username: reel.igUsername, videoUrl: reel.videoUrl });
      if (candidates.length >= MAX_PER_RUN) break;
    }
  }

  for (const item of candidates) {
    // Unmirrored reels keep showing their still and are picked up next run.
    if (opts.deadline && Date.now() >= opts.deadline) {
      result.timedOut = true;
      break;
    }
    const permanent = await cacheVideo(admin, item.videoUrl, `videos/${item.mediaId}.mp4`);
    if (!permanent) {
      result.failed += 1;
      continue;
    }
    // Match on the URL we just mirrored rather than on the media id: the id
    // here is derived from the permalink, and writing by it would need a
    // second lookup. The signed URL is unique per reel, so this hits one row
    // — unless a resync overwrote it with a fresh signed URL in the window
    // between our fetch and this write, in which case zero rows match.
    const { data, error } = await admin
      .from("ig_reel_snapshots")
      .update({ video_url: permanent })
      .eq("video_url", item.videoUrl)
      .select("ig_media_id");
    if (error) {
      console.warn("[showcase-video] snapshot update failed", { id: item.mediaId, error });
      result.failed += 1;
      continue;
    }
    if (!data || data.length === 0) {
      // Nothing to point at the file we just uploaded — delete it rather
      // than leaving an orphaned mirror. A later run will re-mirror under
      // whatever signed URL the row holds by then.
      await admin.storage.from("ig-media").remove([`videos/${item.mediaId}.mp4`]);
      result.failed += 1;
      continue;
    }
    result.mirrored += 1;
  }

  return result;
}

/**
 * Deletes mirrored videos older than the wall's DAYS lookback.
 *
 * Mirrored files are never otherwise removed, and a reel is mirrored shortly
 * after it posts, so a file created more than DAYS ago belongs to a reel the
 * public endpoint can no longer select. Rows pointing at those files get
 * video_url cleared first: if the delete then fails the file is simply listed
 * again next run, whereas deleting first could leave a row pointing at a
 * file that no longer exists.
 *
 * Returns the number of files removed.
 */
export async function pruneStaleShowcaseVideos(admin: SupabaseClient): Promise<number> {
  const bucket = admin.storage.from("ig-media");
  const cutoff = Date.now() - DAYS * 24 * 60 * 60 * 1000;

  const { data: files, error } = await bucket.list("videos", {
    limit: MAX_PRUNE_PER_RUN,
    sortBy: { column: "created_at", order: "asc" },
  });
  if (error || !files) {
    console.warn("[showcase-video] list failed", error);
    return 0;
  }

  const stale = files.filter(
    (f) => f.name.endsWith(".mp4") && f.created_at && Date.parse(f.created_at) < cutoff
  );
  if (stale.length === 0) return 0;

  const paths = stale.map((f) => `videos/${f.name}`);
  const urls = paths.map((p) => bucket.getPublicUrl(p).data.publicUrl);

  const { error: clearError } = await admin
    .from("ig_reel_snapshots")
    .update({ video_url: null })
    .in("video_url", urls);
  if (clearError) {
    console.warn("[showcase-video] clearing video_url failed", clearError);
    return 0;
  }

  const { error: removeError } = await bucket.remove(paths);
  if (removeError) {
    console.warn("[showcase-video] remove failed", removeError);
    return 0;
  }
  return paths.length;
}

// Instagram permalinks look like https://www.instagram.com/reel/<shortcode>/.
// The shortcode is stable, unique, and already URL-safe, which makes it a
// better storage key than the numeric media id (which this shape doesn't
// carry) and safe to interpolate into a path.
function mediaKeyFor(permalink: string | null): string | null {
  if (!permalink) return null;
  const match = permalink.match(/\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/);
  return match ? match[1] : null;
}
