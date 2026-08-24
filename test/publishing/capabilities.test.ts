import { describe, expect, it } from "vitest";
import {
  ALL_UPLOAD_MIME_TYPES,
  PLATFORM_CAPS,
  countCharacters,
  countHashtags,
  extensionForMime,
  itemKindForMime,
  mediaKindFor,
  supportsMediaKind,
} from "@/lib/publishing/capabilities";
import { PLATFORMS } from "@/lib/publishing/types";

describe("PLATFORM_CAPS", () => {
  it("covers every platform", () => {
    for (const platform of PLATFORMS) {
      expect(PLATFORM_CAPS[platform]).toBeDefined();
    }
  });

  it("matches each platform's documented carousel bounds", () => {
    // These numbers are the whole point of the table — if one drifts, the
    // composer starts offering something the API rejects.
    expect(PLATFORM_CAPS.instagram.carousel).toMatchObject({ min: 2, max: 10 });
    expect(PLATFORM_CAPS.threads.carousel).toMatchObject({ min: 2, max: 20 });
    expect(PLATFORM_CAPS.tiktok.carousel).toMatchObject({ min: 2, max: 35 });
    expect(PLATFORM_CAPS.youtube.carousel).toBeNull();
  });

  it("only lets Instagram and Threads mix photos and video in a carousel", () => {
    expect(PLATFORM_CAPS.instagram.carousel?.itemKinds).toEqual(["image", "video"]);
    expect(PLATFORM_CAPS.threads.carousel?.itemKinds).toEqual(["image", "video"]);
    // TikTok photo mode and Facebook multi-photo are photos only.
    expect(PLATFORM_CAPS.tiktok.carousel?.itemKinds).toEqual(["image"]);
    expect(PLATFORM_CAPS.facebook.carousel?.itemKinds).toEqual(["image"]);
  });

  it("keeps YouTube video-only", () => {
    expect(PLATFORM_CAPS.youtube.mediaKinds).toEqual(["video"]);
    expect(PLATFORM_CAPS.youtube.itemKinds).toEqual(["video"]);
    expect(PLATFORM_CAPS.youtube.mimeTypes.image).toEqual([]);
    expect(supportsMediaKind("youtube", "image")).toBe(false);
    expect(supportsMediaKind("youtube", "carousel")).toBe(false);
    expect(supportsMediaKind("youtube", "video")).toBe(true);
  });

  it("declares a caption ceiling and an upload MIME list for every platform", () => {
    for (const platform of PLATFORMS) {
      const cap = PLATFORM_CAPS[platform];
      expect(cap.captionMax).toBeGreaterThan(0);
      expect(cap.mimeTypes.video.length).toBeGreaterThan(0);
      for (const kind of cap.mediaKinds) {
        expect(["video", "image", "carousel"]).toContain(kind);
      }
    }
  });
});

describe("ALL_UPLOAD_MIME_TYPES", () => {
  it("is the union of every platform's accepted types", () => {
    expect(ALL_UPLOAD_MIME_TYPES).toContain("video/mp4");
    expect(ALL_UPLOAD_MIME_TYPES).toContain("image/jpeg");
    expect(ALL_UPLOAD_MIME_TYPES).toContain("image/webp"); // TikTok
    expect(ALL_UPLOAD_MIME_TYPES).toContain("image/png"); // Facebook / Threads
  });

  it("maps every accepted type to a file extension", () => {
    // A type the upload route accepts but can't name would produce an object
    // with no extension, which several platforms sniff on.
    for (const mime of ALL_UPLOAD_MIME_TYPES) {
      expect(extensionForMime(mime), mime).not.toBeNull();
      expect(itemKindForMime(mime), mime).not.toBeNull();
    }
  });

  it("rejects an unknown type", () => {
    expect(extensionForMime("application/pdf")).toBeNull();
    expect(itemKindForMime("application/pdf")).toBeNull();
  });
});

describe("mediaKindFor", () => {
  it("reads one slide as a single post and more as a carousel", () => {
    expect(mediaKindFor([{ kind: "video" }])).toBe("video");
    expect(mediaKindFor([{ kind: "image" }])).toBe("image");
    expect(mediaKindFor([{ kind: "image" }, { kind: "image" }])).toBe("carousel");
    expect(mediaKindFor([{ kind: "image" }, { kind: "video" }])).toBe("carousel");
  });

  it("treats an empty list as a video post", () => {
    // The composer blocks empty posts anyway; this just must not throw.
    expect(mediaKindFor([])).toBe("video");
  });
});

describe("countCharacters", () => {
  it("counts an emoji as one character, not two", () => {
    // String.length is UTF-16 units — "🎬" is 2 there, which silently
    // overcounts every emoji-heavy caption against the platform's limit.
    expect("🎬".length).toBe(2);
    expect(countCharacters("🎬")).toBe(1);
    expect(countCharacters("hi 🎬🔥")).toBe(5);
  });
});

describe("countHashtags", () => {
  it("counts hashtags the way Instagram does", () => {
    expect(countHashtags("#one #two #three")).toBe(3);
    expect(countHashtags("no tags here")).toBe(0);
    expect(countHashtags("#first\n\n#second")).toBe(2);
  });

  it("doesn't count a mid-word hash", () => {
    expect(countHashtags("issue#42")).toBe(0);
  });
});
