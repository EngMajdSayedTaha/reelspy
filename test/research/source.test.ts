import { describe, it, expect } from "vitest";
import { mapIgProfile, mapIgReel } from "@/lib/research/instagram";
import { createTikTokResearchSource, tiktokResearchEnabled } from "@/lib/research/tiktok";
import { availableResearchPlatforms, getResearchSource } from "@/lib/research";

describe("instagram research mappers", () => {
  it("normalizes a Business Discovery profile", () => {
    expect(
      mapIgProfile(
        { username: "acme", followers_count: 1234, profile_picture_url: "http://a/x.jpg" },
        "fallback"
      )
    ).toEqual({
      username: "acme",
      displayName: "acme",
      followersCount: 1234,
      avatarUrl: "http://a/x.jpg",
    });
  });

  it("falls back to the queried username + nulls when fields are missing", () => {
    expect(mapIgProfile({ username: "" }, "queried")).toEqual({
      username: "queried",
      displayName: "queried",
      followersCount: null,
      avatarUrl: null,
    });
  });

  it("normalizes a media item to a ResearchReel", () => {
    expect(
      mapIgReel({
        id: "m1",
        caption: "hi",
        permalink: "http://p",
        thumbnail_url: "http://t",
        view_count: 900,
        like_count: 10,
        comments_count: 2,
        timestamp: "2026-01-01T00:00:00Z",
      })
    ).toEqual({
      externalId: "m1",
      permalink: "http://p",
      caption: "hi",
      thumbnailUrl: "http://t",
      videoUrl: null,
      viewCount: 900,
      likeCount: 10,
      commentCount: 2,
      postedAt: "2026-01-01T00:00:00Z",
    });
  });

  // media_url is the reel's mp4 and is what the public wall plays. It was
  // already in every field list we request from Meta — it just wasn't read.
  it("carries the video URL through for a reel", () => {
    const r = mapIgReel({ id: "m3", media_type: "VIDEO", media_url: "http://v.mp4" });
    expect(r.videoUrl).toBe("http://v.mp4");
  });

  // On an IMAGE or a carousel the same field is a JPEG. Handing that to a
  // <video> element yields a permanently broken one instead of a still.
  it("refuses media_url on non-video media", () => {
    expect(mapIgReel({ id: "m4", media_type: "IMAGE", media_url: "http://x.jpg" }).videoUrl).toBeNull();
    expect(
      mapIgReel({ id: "m5", media_type: "CAROUSEL_ALBUM", media_url: "http://x.jpg" }).videoUrl
    ).toBeNull();
  });

  it("maps missing optional metrics to null", () => {
    const r = mapIgReel({ id: "m2" });
    expect(r.externalId).toBe("m2");
    expect(r.viewCount).toBeNull();
    expect(r.permalink).toBeNull();
  });
});

describe("tiktok research source (dormant)", () => {
  it("is not configured without the flag + creds", () => {
    // No env set in the test runner → disabled.
    expect(tiktokResearchEnabled()).toBe(false);
    expect(createTikTokResearchSource().isConfigured()).toBe(false);
  });

  it("returns a clean unavailable result instead of throwing", async () => {
    const src = createTikTokResearchSource();
    const reels = await src.getRecentReels("someone", 10);
    expect(reels.reels).toEqual([]);
    expect(reels.error).toMatch(/pending platform approval/i);
    const profile = await src.getProfile("someone");
    expect(profile.profile).toBeNull();
    expect(profile.error).toMatch(/pending platform approval/i);
  });
});

describe("research registry", () => {
  it("lists instagram as available, tiktok only when enabled", () => {
    expect(availableResearchPlatforms()).toEqual(["instagram"]);
  });

  it("getResearchSource requires IG credentials for instagram", () => {
    expect(() => getResearchSource("instagram")).toThrow(/credentials/i);
    const ig = getResearchSource("instagram", { igUserId: "1", token: "t" });
    expect(ig.platform).toBe("instagram");
    expect(ig.isConfigured()).toBe(true);
  });

  it("getResearchSource returns the dormant tiktok source", () => {
    const tk = getResearchSource("tiktok");
    expect(tk.platform).toBe("tiktok");
    expect(tk.isConfigured()).toBe(false);
  });
});
