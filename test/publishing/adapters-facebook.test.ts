import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { facebookAdapter } from "@/lib/publishing/adapters/facebook";
import type { PublishInput, PublishMediaItem } from "@/lib/publishing/types";

type Call = { url: string; method: string };
let calls: Call[] = [];

function fbMock() {
  let photoSeq = 0;
  return vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? "GET" });

    const json = (body: unknown) =>
      ({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => body,
        text: async () => JSON.stringify(body),
      }) as unknown as Response;

    if (url.includes("/photos")) {
      photoSeq += 1;
      return json({ id: `photo-${photoSeq}`, post_id: `page-1_post-${photoSeq}` });
    }
    if (url.includes("/feed")) return json({ id: "page-1_feed-9" });
    if (url.includes("/videos")) return json({ id: "video-1" });
    return json({});
  });
}

function media(kind: "image" | "video", position = 0): PublishMediaItem {
  return {
    position,
    kind,
    url: `https://media.example.com/${position}.${kind === "image" ? "jpg" : "mp4"}`,
    mimeType: kind === "image" ? "image/jpeg" : "video/mp4",
    altText: null,
  };
}

function input(over: Partial<PublishInput> = {}): PublishInput {
  return {
    content: { title: "A title", caption: "hello", hashtags: "#a" },
    media: [media("video")],
    mediaKind: "video",
    coverIndex: 0,
    coverMs: null,
    creds: {
      accessToken: "user-tok",
      accountId: "page-1",
      pageId: "page-1",
      pageToken: "page-tok",
    },
    privacy: "public",
    ...over,
  };
}

beforeEach(() => {
  calls = [];
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("facebookAdapter", () => {
  it("posts a video with file_url and the PAGE token", async () => {
    vi.stubGlobal("fetch", fbMock());
    const result = await facebookAdapter.publish(input());

    const call = calls.find((c) => c.url.includes("/videos"))!;
    expect(call.url).toContain("file_url=");
    expect(call.url).toContain("description=hello");
    // The page token, never the user token — posting with the user token 403s.
    expect(call.url).toContain("access_token=page-tok");
    expect(result.remoteId).toBe("video-1");
  });

  it("posts a single photo published straight away", async () => {
    vi.stubGlobal("fetch", fbMock());
    const result = await facebookAdapter.publish(
      input({ mediaKind: "image", media: [{ ...media("image"), altText: "a chart" }] })
    );

    const call = calls.find((c) => c.url.includes("/photos"))!;
    expect(call.url).toContain("published=true");
    expect(call.url).toContain("caption=hello");
    expect(call.url).toContain("alt_text_custom=a+chart");
    expect(result.remoteUrl).toBe("https://www.facebook.com/page-1/posts/post-1");
  });

  it("uploads a multi-photo post unpublished, then attaches them to one feed post", async () => {
    vi.stubGlobal("fetch", fbMock());

    const result = await facebookAdapter.publish(
      input({
        mediaKind: "carousel",
        media: [media("image", 0), media("image", 1), media("image", 2)],
      })
    );

    const photos = calls.filter((c) => c.url.includes("/photos"));
    expect(photos).toHaveLength(3);
    for (const photo of photos) {
      // Each photo has to stay unpublished, or the page gets three posts
      // instead of one album.
      expect(photo.url).toContain("published=false");
    }

    const feed = calls.find((c) => c.url.includes("/feed"))!;
    // attached_media is an indexed param whose values are JSON objects — not a
    // JSON array, which Graph silently ignores.
    expect(feed.url).toContain("attached_media%5B0%5D=");
    expect(decodeURIComponent(feed.url)).toContain('attached_media[0]={"media_fbid":"photo-1"}');
    expect(decodeURIComponent(feed.url)).toContain('attached_media[2]={"media_fbid":"photo-3"}');
    expect(feed.url).toContain("message=hello");

    expect(result.remoteId).toBe("page-1_feed-9");
    expect(result.remoteUrl).toBe("https://www.facebook.com/page-1/posts/feed-9");
  });
});
