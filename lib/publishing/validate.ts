// The one validator. Pure, no I/O, no i18n — it returns issue CODES and the
// values a message interpolates, so `lib/i18n/dictionaries/publishing.ts` owns
// the wording in both locales.
//
// It runs twice, on purpose:
//   * in the composer, so the user sees exactly what's blocking before uploading
//   * in `createPublishPost`, so a stale tab or a hand-rolled request can never
//     queue a job that only the platform can reject
//
// Anything that would come back as a platform error at publish time and is
// knowable up front belongs here.

import {
  PLATFORM_CAPS,
  countCharacters,
  countHashtags,
  mediaKindFor,
} from "./capabilities";
import type { MediaItemKind, MediaKind, Platform } from "./types";

export type IssueSeverity = "error" | "warning";

export type IssueCode =
  | "noMedia"
  | "noPlatforms"
  | "mediaKindUnsupported"
  | "carouselTooFew"
  | "carouselTooMany"
  | "carouselItemKindUnsupported"
  | "mimeUnsupported"
  | "fileTooLarge"
  | "videoTooShort"
  | "videoTooLong"
  | "captionTooLong"
  | "titleTooLong"
  | "tooManyHashtags"
  | "scheduleInPast"
  | "aspectRatioOutOfRange"
  | "altTextIgnored";

export type Issue = {
  code: IssueCode;
  severity: IssueSeverity;
  /** null when the issue is about the post as a whole, not one target. */
  platform: Platform | null;
  /** Interpolation values for the localized message. */
  values?: Record<string, string | number>;
};

export type DraftMedia = {
  kind: MediaItemKind;
  mimeType: string;
  bytes: number | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  altText?: string | null;
};

export type Draft = {
  media: readonly DraftMedia[];
  platforms: readonly Platform[];
  title: string;
  caption: string;
  hashtags: string;
  /** Per-platform caption overrides; blank/absent falls back to `caption`. */
  captions?: Partial<Record<Platform, string>>;
  /** ISO datetime, or null to publish immediately. */
  scheduledAt?: string | null;
};

export type ValidationResult = {
  errors: Issue[];
  warnings: Issue[];
  /** Convenience: the post shape the media implies. */
  mediaKind: MediaKind;
};

// Instagram crops feed images to the first slide's ratio and rejects anything
// outside 4:5 → 1.91:1 outright.
const IG_MIN_RATIO = 4 / 5;
const IG_MAX_RATIO = 1.91;

/**
 * The text a platform actually receives: its own override when set, otherwise
 * the shared caption, with hashtags appended the way `buildCaption()` joins
 * them. Kept in lockstep with lib/publishing/caption.ts — if that join changes,
 * the counters here have to change with it.
 */
export function effectiveCaption(draft: Draft, platform: Platform): string {
  const override = draft.captions?.[platform]?.trim();
  const base = override ? override : draft.caption.trim();
  return [base, draft.hashtags.trim()].filter(Boolean).join("\n\n");
}

export function validateDraft(draft: Draft, now: number = Date.now()): ValidationResult {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const mediaKind = mediaKindFor(draft.media);

  const err = (code: IssueCode, platform: Platform | null, values?: Issue["values"]) =>
    errors.push({ code, severity: "error", platform, values });
  const warn = (code: IssueCode, platform: Platform | null, values?: Issue["values"]) =>
    warnings.push({ code, severity: "warning", platform, values });

  if (draft.media.length === 0) err("noMedia", null);
  if (draft.platforms.length === 0) err("noPlatforms", null);

  if (draft.scheduledAt) {
    const at = new Date(draft.scheduledAt).getTime();
    // A minute of slack: the user picked a time, then spent a moment uploading.
    if (Number.isFinite(at) && at < now - 60_000) err("scheduleInPast", null);
  }

  for (const platform of draft.platforms) {
    const cap = PLATFORM_CAPS[platform];

    // 1. Can this platform post this shape at all?
    if (draft.media.length > 0 && !cap.mediaKinds.includes(mediaKind)) {
      err("mediaKindUnsupported", platform, { mediaKind });
      // Everything below is about the media it can't take — don't pile on.
      continue;
    }

    // 2. Carousel bounds + what a carousel may contain.
    if (mediaKind === "carousel" && cap.carousel) {
      if (draft.media.length < cap.carousel.min) {
        err("carouselTooFew", platform, { min: cap.carousel.min, count: draft.media.length });
      }
      if (draft.media.length > cap.carousel.max) {
        err("carouselTooMany", platform, {
          max: cap.carousel.max,
          count: draft.media.length,
          over: draft.media.length - cap.carousel.max,
        });
      }
      for (const kind of new Set(draft.media.map((m) => m.kind))) {
        if (!cap.carousel.itemKinds.includes(kind)) {
          err("carouselItemKindUnsupported", platform, { itemKind: kind });
          break;
        }
      }
    }

    // 3. Per-slide format, size and duration.
    draft.media.forEach((item, index) => {
      const slide = index + 1;

      if (!cap.mimeTypes[item.kind].includes(item.mimeType)) {
        err("mimeUnsupported", platform, {
          slide,
          mimeType: item.mimeType,
          accepted: cap.mimeTypes[item.kind].join(", "),
        });
      }

      const maxBytes = cap.maxBytes[item.kind];
      if (item.bytes != null && maxBytes > 0 && item.bytes > maxBytes) {
        err("fileTooLarge", platform, {
          slide,
          maxMb: Math.round(maxBytes / (1024 * 1024)),
          actualMb: Math.round((item.bytes / (1024 * 1024)) * 10) / 10,
        });
      }

      if (item.kind === "video" && cap.videoSeconds && item.durationSeconds != null) {
        if (item.durationSeconds < cap.videoSeconds.min) {
          err("videoTooShort", platform, { slide, min: cap.videoSeconds.min });
        }
        if (item.durationSeconds > cap.videoSeconds.max) {
          err("videoTooLong", platform, {
            slide,
            maxMinutes: Math.round((cap.videoSeconds.max / 60) * 10) / 10,
          });
        }
      }

      // Warning, not an error: the browser probe can fail or read a rotated
      // image's dimensions the wrong way round, and blocking a valid post on a
      // bad measurement is worse than letting Instagram have the last word.
      if (
        platform === "instagram" &&
        item.kind === "image" &&
        item.width != null &&
        item.height != null &&
        item.height > 0
      ) {
        const ratio = item.width / item.height;
        if (ratio < IG_MIN_RATIO || ratio > IG_MAX_RATIO) {
          warn("aspectRatioOutOfRange", platform, {
            slide,
            ratio: `${Math.round(ratio * 100) / 100}:1`,
          });
        }
      }

      if (item.altText?.trim() && !cap.altText) {
        warn("altTextIgnored", platform, { slide });
      }
    });

    // 4. Copy limits, measured on what the platform will really receive.
    const caption = effectiveCaption(draft, platform);
    const captionLength = countCharacters(caption);
    if (captionLength > cap.captionMax) {
      err("captionTooLong", platform, {
        max: cap.captionMax,
        count: captionLength,
        over: captionLength - cap.captionMax,
      });
    }

    if (cap.hashtagMax != null) {
      const tags = countHashtags(caption);
      if (tags > cap.hashtagMax) {
        err("tooManyHashtags", platform, { max: cap.hashtagMax, count: tags });
      }
    }

    const title = draft.title.trim();
    if (cap.titleMax != null && countCharacters(title) > cap.titleMax) {
      err("titleTooLong", platform, { max: cap.titleMax, count: countCharacters(title) });
    }
  }

  return { errors, warnings, mediaKind };
}

/**
 * Whether this platform can post this SHAPE of post at all — a photo to
 * YouTube, a carousel to a platform without carousels.
 *
 * Deliberately only the kind check. A count overflow ("Instagram takes 10, you
 * have 12") or a mixed-media carousel is fixable by editing the post, so those
 * stay as validation errors that say what to remove; disabling the platform
 * outright would hide the fix. This is for the mismatches nothing but changing
 * platform can resolve.
 */
export function platformAcceptsMedia(
  platform: Platform,
  media: readonly DraftMedia[]
): boolean {
  if (media.length === 0) return true;
  const cap = PLATFORM_CAPS[platform];
  const kind = mediaKindFor(media);
  if (!cap.mediaKinds.includes(kind)) return false;
  if (kind === "carousel") return Boolean(cap.carousel);
  return cap.itemKinds.includes(media[0].kind);
}
