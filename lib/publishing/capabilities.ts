// What each platform will actually accept — one table, read by everything.
//
// The composer, the server action's re-validation, and the adapters all need
// the same answers ("does Instagram take 11 slides?", "can YouTube post a
// photo?"). Keeping three copies of those numbers is how a composer starts
// offering something the API rejects, so they live here once.
//
// Deliberately a PURE module (no `server-only`): the client composer, the
// server action and vitest all import this exact object. Every number below is
// from the platform's own published docs — sources noted per platform.

import { PLATFORMS, type MediaItemKind, type MediaKind, type Platform } from "./types";

export type PlatformCap = {
  /** Which post shapes this platform can publish at all. */
  mediaKinds: readonly MediaKind[];
  /** Slide types a single-media post may use. */
  itemKinds: readonly MediaItemKind[];
  /**
   * Inclusive carousel bounds plus what a carousel may contain — Instagram and
   * Threads mix image and video freely, while TikTok's carousel is photo mode
   * and Facebook's is a multi-photo post. `null` = no carousel support.
   */
  carousel: { min: number; max: number; itemKinds: readonly MediaItemKind[] } | null;
  /** Accepted upload MIME types, per slide kind. */
  mimeTypes: Record<MediaItemKind, readonly string[]>;
  /** Hard per-file ceilings the platform documents, in bytes. */
  maxBytes: Record<MediaItemKind, number>;
  /** Video duration bounds in seconds. */
  videoSeconds: { min: number; max: number } | null;
  /** Caption/body character ceiling (code points, not UTF-16 units). */
  captionMax: number;
  /** Separate title field ceiling, when the platform has one. */
  titleMax: number | null;
  /** Hashtag ceiling, when the platform enforces one. */
  hashtagMax: number | null;
  /** Whether per-slide alt text reaches the API. */
  altText: boolean;
  /** Whether a cover frame/slide can be chosen. */
  cover: false | "frame" | "slide";
  /** Documented API-published posts per rolling 24h, for the pre-flight hint. */
  dailyPosts: number | null;
};

const MB = 1024 * 1024;

export const PLATFORM_CAPS: Record<Platform, PlatformCap> = {
  // developers.facebook.com/docs/instagram-platform/content-publishing
  // Carousels: 2–10 children, mixed image/video, counted as ONE post.
  // 50 published posts / 24h; containers expire after 24h.
  instagram: {
    mediaKinds: ["video", "image", "carousel"],
    itemKinds: ["image", "video"],
    carousel: { min: 2, max: 10, itemKinds: ["image", "video"] },
    mimeTypes: {
      image: ["image/jpeg"],
      video: ["video/mp4", "video/quicktime"],
    },
    maxBytes: { image: 8 * MB, video: 300 * MB },
    videoSeconds: { min: 3, max: 15 * 60 },
    captionMax: 2200,
    titleMax: null,
    hashtagMax: 30,
    altText: true,
    cover: "frame",
    dailyPosts: 50,
  },

  // developers.facebook.com/docs/graph-api/reference/page/photos
  // Multi-photo posts go /photos?published=false → /feed attached_media[i].
  // Reels (video) are limited to 30 API posts / 24h.
  facebook: {
    mediaKinds: ["video", "image", "carousel"],
    itemKinds: ["image", "video"],
    carousel: { min: 2, max: 10, itemKinds: ["image"] },
    mimeTypes: {
      image: ["image/jpeg", "image/png"],
      video: ["video/mp4", "video/quicktime"],
    },
    maxBytes: { image: 10 * MB, video: 1024 * MB },
    videoSeconds: null,
    captionMax: 63206,
    titleMax: 255,
    hashtagMax: null,
    altText: true,
    cover: false,
    dailyPosts: 30,
  },

  // developers.tiktok.com/doc/content-posting-api-get-started
  // Photo mode carousels take up to 35 images; photos and video can't be mixed.
  tiktok: {
    mediaKinds: ["video", "image", "carousel"],
    itemKinds: ["image", "video"],
    carousel: { min: 2, max: 35, itemKinds: ["image"] },
    mimeTypes: {
      image: ["image/jpeg", "image/webp"],
      video: ["video/mp4", "video/quicktime", "video/webm"],
    },
    maxBytes: { image: 20 * MB, video: 4096 * MB },
    videoSeconds: null,
    captionMax: 2200,
    titleMax: 90,
    hashtagMax: null,
    altText: false,
    cover: "slide",
    dailyPosts: null,
  },

  // developers.google.com/youtube/v3/docs/videos/insert
  // Video only, and the default 10,000-unit daily quota allows ~6 uploads.
  youtube: {
    mediaKinds: ["video"],
    itemKinds: ["video"],
    carousel: null,
    mimeTypes: {
      image: [],
      video: ["video/mp4", "video/quicktime", "video/webm"],
    },
    maxBytes: { image: 0, video: 4096 * MB },
    videoSeconds: null,
    captionMax: 5000,
    titleMax: 100,
    hashtagMax: null,
    altText: false,
    cover: false,
    dailyPosts: 6,
  },

  // developers.facebook.com/docs/threads/create-posts
  // Carousels: 2–20 children, mixed. 250 published posts / 24h. Text caps at
  // 500 characters (emoji counted as UTF-8 bytes by Threads itself).
  threads: {
    mediaKinds: ["video", "image", "carousel"],
    itemKinds: ["image", "video"],
    carousel: { min: 2, max: 20, itemKinds: ["image", "video"] },
    mimeTypes: {
      image: ["image/jpeg", "image/png"],
      video: ["video/mp4", "video/quicktime"],
    },
    maxBytes: { image: 8 * MB, video: 1024 * MB },
    videoSeconds: { min: 0, max: 5 * 60 },
    captionMax: 500,
    titleMax: null,
    hashtagMax: null,
    altText: false,
    cover: false,
    dailyPosts: 250,
  },
};

/** Every MIME type any platform accepts — the upload route's allowlist. */
export const ALL_UPLOAD_MIME_TYPES: readonly string[] = Array.from(
  new Set(
    PLATFORMS.flatMap((platform) => [
      ...PLATFORM_CAPS[platform].mimeTypes.image,
      ...PLATFORM_CAPS[platform].mimeTypes.video,
    ])
  )
).sort();

/** File extension for an accepted upload MIME type. */
const EXTENSIONS: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function extensionForMime(mimeType: string): string | null {
  return EXTENSIONS[mimeType] ?? null;
}

export function itemKindForMime(mimeType: string): MediaItemKind | null {
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("image/")) return "image";
  return null;
}

/** The post shape implied by a set of slides. */
export function mediaKindFor(items: readonly { kind: MediaItemKind }[]): MediaKind {
  if (items.length > 1) return "carousel";
  return items[0]?.kind === "image" ? "image" : "video";
}

/** Whether a platform can publish this post shape at all. */
export function supportsMediaKind(platform: Platform, kind: MediaKind): boolean {
  return PLATFORM_CAPS[platform].mediaKinds.includes(kind);
}

/**
 * Character count as a human (and every platform's own counter) sees it:
 * by code point, so an emoji is 1 and not 2. `String.length` counts UTF-16
 * units, which silently overcounts every emoji in a caption.
 */
export function countCharacters(text: string): number {
  return [...text].length;
}

/** Hashtags in a caption, the way Instagram counts them. */
export function countHashtags(text: string): number {
  return text.match(/(^|\s)#[^\s#]+/g)?.length ?? 0;
}
