import { describe, expect, it } from "vitest";
import {
  effectiveCaption,
  platformAcceptsMedia,
  validateDraft,
  type Draft,
  type DraftMedia,
  type IssueCode,
} from "@/lib/publishing/validate";
import type { Platform } from "@/lib/publishing/types";

const NOW = Date.UTC(2026, 7, 22, 12, 0, 0);

function image(over: Partial<DraftMedia> = {}): DraftMedia {
  return {
    kind: "image",
    mimeType: "image/jpeg",
    bytes: 1_000_000,
    width: 1080,
    height: 1350, // 4:5, inside Instagram's range
    durationSeconds: null,
    ...over,
  };
}

function video(over: Partial<DraftMedia> = {}): DraftMedia {
  return {
    kind: "video",
    mimeType: "video/mp4",
    bytes: 10_000_000,
    width: 1080,
    height: 1920,
    durationSeconds: 30,
    ...over,
  };
}

function draft(over: Partial<Draft> = {}): Draft {
  return {
    media: [video()],
    platforms: ["instagram"],
    title: "",
    caption: "",
    hashtags: "",
    ...over,
  };
}

function codes(issues: { code: IssueCode }[]): IssueCode[] {
  return issues.map((i) => i.code);
}

describe("validateDraft — the post as a whole", () => {
  it("requires media and at least one platform", () => {
    const { errors } = validateDraft(draft({ media: [], platforms: [] }), NOW);
    expect(codes(errors)).toContain("noMedia");
    expect(codes(errors)).toContain("noPlatforms");
  });

  it("passes a plain single video to Instagram", () => {
    const { errors, mediaKind } = validateDraft(draft(), NOW);
    expect(errors).toEqual([]);
    expect(mediaKind).toBe("video");
  });

  it("rejects a scheduled time in the past but tolerates a minute of slack", () => {
    const past = validateDraft(
      draft({ scheduledAt: new Date(NOW - 10 * 60_000).toISOString() }),
      NOW
    );
    expect(codes(past.errors)).toContain("scheduleInPast");

    // The user picked a time, then spent a moment uploading.
    const justNow = validateDraft(
      draft({ scheduledAt: new Date(NOW - 30_000).toISOString() }),
      NOW
    );
    expect(codes(justNow.errors)).not.toContain("scheduleInPast");
  });
});

describe("validateDraft — media kind vs platform", () => {
  it("blocks a photo aimed at YouTube", () => {
    const { errors } = validateDraft(
      draft({ media: [image()], platforms: ["youtube"] }),
      NOW
    );
    expect(codes(errors)).toEqual(["mediaKindUnsupported"]);
    expect(errors[0].values?.mediaKind).toBe("image");
  });

  it("blocks a carousel aimed at YouTube", () => {
    const { errors } = validateDraft(
      draft({ media: [image(), image()], platforms: ["youtube"] }),
      NOW
    );
    expect(codes(errors)).toEqual(["mediaKindUnsupported"]);
  });

  it("stops piling on once the kind is impossible", () => {
    // A 5000-character caption is also over YouTube's limit, but there is no
    // point listing it when the post can't go there at all.
    const { errors } = validateDraft(
      draft({ media: [image()], platforms: ["youtube"], caption: "x".repeat(9000) }),
      NOW
    );
    expect(errors).toHaveLength(1);
  });
});

describe("validateDraft — carousel bounds", () => {
  const eleven = Array.from({ length: 11 }, () => image());

  it("blocks an 11-slide carousel on Instagram with an actionable count", () => {
    const { errors } = validateDraft(draft({ media: eleven, platforms: ["instagram"] }), NOW);
    const issue = errors.find((e) => e.code === "carouselTooMany");
    expect(issue).toBeDefined();
    expect(issue!.values).toMatchObject({ max: 10, count: 11, over: 1 });
  });

  it("accepts the same 11 slides on Threads and TikTok", () => {
    for (const platform of ["threads", "tiktok"] as Platform[]) {
      const { errors } = validateDraft(draft({ media: eleven, platforms: [platform] }), NOW);
      expect(codes(errors), platform).not.toContain("carouselTooMany");
    }
  });

  it("blocks a video inside a TikTok or Facebook carousel", () => {
    for (const platform of ["tiktok", "facebook"] as Platform[]) {
      const { errors } = validateDraft(
        draft({ media: [image(), video()], platforms: [platform] }),
        NOW
      );
      const issue = errors.find((e) => e.code === "carouselItemKindUnsupported");
      expect(issue, platform).toBeDefined();
      expect(issue!.values?.itemKind).toBe("video");
    }
  });

  it("allows a mixed carousel on Instagram and Threads", () => {
    for (const platform of ["instagram", "threads"] as Platform[]) {
      const { errors } = validateDraft(
        draft({ media: [image(), video()], platforms: [platform] }),
        NOW
      );
      expect(codes(errors), platform).not.toContain("carouselItemKindUnsupported");
    }
  });

  it("reports the item-kind problem once, not once per slide", () => {
    const { errors } = validateDraft(
      draft({ media: [video(), video(), video()], platforms: ["tiktok"] }),
      NOW
    );
    expect(errors.filter((e) => e.code === "carouselItemKindUnsupported")).toHaveLength(1);
  });
});

describe("validateDraft — per-slide format, size and duration", () => {
  it("rejects a PNG on Instagram, which takes JPEG only", () => {
    const { errors } = validateDraft(
      draft({ media: [image({ mimeType: "image/png" })], platforms: ["instagram"] }),
      NOW
    );
    const issue = errors.find((e) => e.code === "mimeUnsupported");
    expect(issue).toBeDefined();
    expect(issue!.values).toMatchObject({ slide: 1, mimeType: "image/png" });
  });

  it("accepts that same PNG on Facebook and Threads", () => {
    for (const platform of ["facebook", "threads"] as Platform[]) {
      const { errors } = validateDraft(
        draft({ media: [image({ mimeType: "image/png" })], platforms: [platform] }),
        NOW
      );
      expect(codes(errors), platform).not.toContain("mimeUnsupported");
    }
  });

  it("rejects an image over the platform's byte ceiling", () => {
    const { errors } = validateDraft(
      draft({ media: [image({ bytes: 9 * 1024 * 1024 })], platforms: ["instagram"] }),
      NOW
    );
    const issue = errors.find((e) => e.code === "fileTooLarge");
    expect(issue).toBeDefined();
    expect(issue!.values?.maxMb).toBe(8);
  });

  it("rejects a video shorter than Instagram's 3-second floor", () => {
    const { errors } = validateDraft(
      draft({ media: [video({ durationSeconds: 1.5 })], platforms: ["instagram"] }),
      NOW
    );
    expect(codes(errors)).toContain("videoTooShort");
  });

  it("rejects a video past Instagram's 15-minute ceiling", () => {
    const { errors } = validateDraft(
      draft({ media: [video({ durationSeconds: 16 * 60 })], platforms: ["instagram"] }),
      NOW
    );
    expect(codes(errors)).toContain("videoTooLong");
  });

  it("says nothing about duration it couldn't measure", () => {
    // A codec the browser can't decode yields null — "unknown" must not read
    // as "too short".
    const { errors } = validateDraft(
      draft({ media: [video({ durationSeconds: null })], platforms: ["instagram"] }),
      NOW
    );
    expect(errors).toEqual([]);
  });
});

describe("validateDraft — captions and titles", () => {
  it("counts what the platform actually receives, caption plus hashtags", () => {
    // Threads caps at 500. 460 + a 60-char hashtag block goes over only once
    // the hashtags are included — which is what buildCaption() sends.
    const { errors } = validateDraft(
      draft({
        media: [image()],
        platforms: ["threads"],
        caption: "x".repeat(460),
        hashtags: "#" + "y".repeat(58),
      }),
      NOW
    );
    const issue = errors.find((e) => e.code === "captionTooLong");
    expect(issue).toBeDefined();
    expect(issue!.values?.max).toBe(500);
  });

  it("measures a per-platform override, not the shared caption", () => {
    const base = {
      media: [image()],
      platforms: ["threads"] as Platform[],
      caption: "x".repeat(900), // way over on its own
    };
    // A short override rescues it.
    const ok = validateDraft(draft({ ...base, captions: { threads: "short" } }), NOW);
    expect(codes(ok.errors)).not.toContain("captionTooLong");

    // Without the override it's over.
    const over = validateDraft(draft(base), NOW);
    expect(codes(over.errors)).toContain("captionTooLong");
  });

  it("enforces Instagram's 30-hashtag limit", () => {
    const tags = Array.from({ length: 31 }, (_, i) => `#tag${i}`).join(" ");
    const { errors } = validateDraft(draft({ hashtags: tags }), NOW);
    const issue = errors.find((e) => e.code === "tooManyHashtags");
    expect(issue).toBeDefined();
    expect(issue!.values).toMatchObject({ max: 30, count: 31 });
  });

  it("has no hashtag limit on platforms that don't publish one", () => {
    const tags = Array.from({ length: 40 }, (_, i) => `#tag${i}`).join(" ");
    const { errors } = validateDraft(
      draft({ platforms: ["tiktok"], hashtags: tags }),
      NOW
    );
    expect(codes(errors)).not.toContain("tooManyHashtags");
  });

  it("enforces YouTube's 100-character title", () => {
    const { errors } = validateDraft(
      draft({ platforms: ["youtube"], title: "t".repeat(101) }),
      NOW
    );
    expect(codes(errors)).toContain("titleTooLong");
  });
});

describe("validateDraft — warnings", () => {
  it("warns rather than blocks on an Instagram aspect ratio outside 4:5–1.91:1", () => {
    const { errors, warnings } = validateDraft(
      draft({ media: [image({ width: 1080, height: 2400 })], platforms: ["instagram"] }),
      NOW
    );
    // A bad browser probe must never block a valid post.
    expect(errors).toEqual([]);
    expect(codes(warnings)).toContain("aspectRatioOutOfRange");
  });

  it("warns when alt text is set for a platform that has no alt text field", () => {
    const { warnings } = validateDraft(
      draft({ media: [image({ altText: "a chart" })], platforms: ["tiktok"] }),
      NOW
    );
    expect(codes(warnings)).toContain("altTextIgnored");
  });

  it("stays quiet about alt text on platforms that do accept it", () => {
    const { warnings } = validateDraft(
      draft({ media: [image({ altText: "a chart" })], platforms: ["instagram", "facebook"] }),
      NOW
    );
    expect(codes(warnings)).not.toContain("altTextIgnored");
  });
});

describe("effectiveCaption", () => {
  it("joins caption and hashtags exactly like buildCaption", () => {
    const d = draft({ caption: "hello", hashtags: "#a #b" });
    expect(effectiveCaption(d, "instagram")).toBe("hello\n\n#a #b");
  });

  it("drops the blank half rather than leaving a stray newline", () => {
    expect(effectiveCaption(draft({ caption: "hello", hashtags: "" }), "instagram")).toBe("hello");
    expect(effectiveCaption(draft({ caption: "", hashtags: "#a" }), "instagram")).toBe("#a");
  });

  it("falls back to the shared caption when an override is blank", () => {
    const d = draft({ caption: "shared", captions: { instagram: "   " } });
    expect(effectiveCaption(d, "instagram")).toBe("shared");
  });
});

describe("platformAcceptsMedia", () => {
  it("is about shape only — a fixable count is not a rejection", () => {
    const eleven = Array.from({ length: 11 }, () => image());
    // Instagram can't take 11 slides, but the fix is "remove one", so the
    // platform stays selectable and the validator explains.
    expect(platformAcceptsMedia("instagram", eleven)).toBe(true);
    // A photo on YouTube is unfixable without changing platform.
    expect(platformAcceptsMedia("youtube", [image()])).toBe(false);
    expect(platformAcceptsMedia("youtube", [video()])).toBe(true);
    expect(platformAcceptsMedia("youtube", [video(), video()])).toBe(false);
  });

  it("accepts anything when there's no media yet", () => {
    for (const platform of ["instagram", "youtube", "tiktok"] as Platform[]) {
      expect(platformAcceptsMedia(platform, []), platform).toBe(true);
    }
  });
});
