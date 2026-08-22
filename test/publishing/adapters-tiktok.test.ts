import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tiktokAdapter } from "@/lib/publishing/adapters/tiktok";
import type { PublishInput, PublishMediaItem, TikTokPostOptions } from "@/lib/publishing/types";

vi.stubEnv("PUBLISH_POLL_INTERVAL_MS", "1");
vi.stubEnv("PUBLISH_CONTAINER_TIMEOUT_MS", "5000");

type Call = { url: string; body: Record<string, unknown> };
let calls: Call[] = [];

function tiktokMock(status: Record<string, unknown> = { status: "PUBLISH_COMPLETE" }) {
  return vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    calls.push({ url, body });

    const json = (payload: unknown) =>
      ({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => payload,
        text: async () => JSON.stringify(payload),
      }) as unknown as Response;

    if (url.includes("/status/fetch/")) return json({ data: status });
    return json({ data: { publish_id: "pub-1" } });
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

const directOptions: TikTokPostOptions = {
  privacyLevel: "PUBLIC_TO_EVERYONE",
  postMode: "direct",
  brandedContent: false,
  brandOrganic: false,
  autoAddMusic: true,
};

function input(over: Partial<PublishInput> = {}): PublishInput {
  return {
    content: { title: "My title", caption: "hello", hashtags: "#fyp" },
    media: [media("video")],
    mediaKind: "video",
    coverIndex: 0,
    coverMs: null,
    creds: { accessToken: "tok", accountId: "open-id", accountUsername: "creator" },
    privacy: "public",
    tiktokOptions: directOptions,
    ...over,
  };
}

function initCall() {
  return calls.find((c) => c.url.includes("/init/"))!;
}

beforeEach(() => {
  calls = [];
  vi.stubEnv("TIKTOK_ALLOW_PUBLIC", "true");
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("tiktokAdapter — photo posts", () => {
  it("uses the unified content/init endpoint with PHOTO media_type", async () => {
    vi.stubGlobal("fetch", tiktokMock());

    await tiktokAdapter.publish(
      input({
        mediaKind: "carousel",
        media: [media("image", 0), media("image", 1), media("image", 2)],
        coverIndex: 1,
      })
    );

    const init = initCall();
    expect(init.url).toContain("/post/publish/content/init/");
    expect(init.body.media_type).toBe("PHOTO");
    expect(init.body.post_mode).toBe("DIRECT_POST");

    const source = init.body.source_info as Record<string, unknown>;
    expect(source.source).toBe("PULL_FROM_URL");
    expect(source.photo_cover_index).toBe(1);
    expect(source.photo_images).toHaveLength(3);
  });

  it("clamps a cover index that points past the last slide", async () => {
    vi.stubGlobal("fetch", tiktokMock());
    await tiktokAdapter.publish(
      input({ mediaKind: "carousel", media: [media("image", 0), media("image", 1)], coverIndex: 9 })
    );
    const source = initCall().body.source_info as Record<string, unknown>;
    expect(source.photo_cover_index).toBe(1);
  });

  it("forwards auto_add_music for photo posts", async () => {
    vi.stubGlobal("fetch", tiktokMock());
    await tiktokAdapter.publish(
      input({
        mediaKind: "carousel",
        media: [media("image", 0), media("image", 1)],
        tiktokOptions: { ...directOptions, autoAddMusic: false },
      })
    );
    const info = initCall().body.post_info as Record<string, unknown>;
    expect(info.auto_add_music).toBe(false);
  });

  it("routes a draft to MEDIA_UPLOAD and skips the status poll", async () => {
    vi.stubGlobal("fetch", tiktokMock());

    const result = await tiktokAdapter.publish(
      input({
        mediaKind: "carousel",
        media: [media("image", 0), media("image", 1)],
        tiktokOptions: { ...directOptions, postMode: "draft" },
      })
    );

    expect(initCall().body.post_mode).toBe("MEDIA_UPLOAD");
    // The creator finishes the post inside TikTok, so there's nothing to poll.
    expect(calls.some((c) => c.url.includes("/status/fetch/"))).toBe(false);
    expect(result).toEqual({ remoteId: "pub-1", remoteUrl: null });
  });
});

describe("tiktokAdapter — permalinks", () => {
  it("builds a real URL from the public post id the status endpoint returns", async () => {
    // The init call only returns a publish_id, which isn't a URL — the post id
    // arrives with PUBLISH_COMPLETE, and it's the only way to link the post.
    vi.stubGlobal(
      "fetch",
      tiktokMock({ status: "PUBLISH_COMPLETE", publicaly_available_post_id: ["7412345"] })
    );

    const result = await tiktokAdapter.publish(input());
    expect(result.remoteUrl).toBe("https://www.tiktok.com/@creator/video/7412345");
  });

  it("returns no URL when TikTok gives no post id", async () => {
    vi.stubGlobal("fetch", tiktokMock());
    const result = await tiktokAdapter.publish(input());
    expect(result.remoteUrl).toBeNull();
    expect(result.remoteId).toBe("pub-1");
  });

  it("returns no URL when the handle is unknown", async () => {
    vi.stubGlobal(
      "fetch",
      tiktokMock({ status: "PUBLISH_COMPLETE", publicaly_available_post_id: ["7412345"] })
    );
    const result = await tiktokAdapter.publish(
      input({ creds: { accessToken: "tok", accountId: "open-id", accountUsername: null } })
    );
    expect(result.remoteUrl).toBeNull();
  });
});

describe("tiktokAdapter — pre-audit privacy", () => {
  it("forces SELF_ONLY until TIKTOK_ALLOW_PUBLIC is set", async () => {
    vi.stubEnv("TIKTOK_ALLOW_PUBLIC", "");
    vi.stubGlobal("fetch", tiktokMock());

    await tiktokAdapter.publish(input());

    const info = initCall().body.post_info as Record<string, unknown>;
    expect(info.privacy_level).toBe("SELF_ONLY");
  });

  it("refuses branded content that would post privately", async () => {
    vi.stubEnv("TIKTOK_ALLOW_PUBLIC", "");
    vi.stubGlobal("fetch", tiktokMock());

    // The composer and the server action both gate this; the adapter is the
    // last line of defense so a bad request never reaches TikTok unexplained.
    await expect(
      tiktokAdapter.publish(input({ tiktokOptions: { ...directOptions, brandedContent: true } }))
    ).rejects.toThrow(/branded content/i);

    expect(calls).toHaveLength(0);
  });

  it("honours the creator's chosen level once the audit has passed", async () => {
    vi.stubGlobal("fetch", tiktokMock());
    await tiktokAdapter.publish(
      input({ tiktokOptions: { ...directOptions, privacyLevel: "MUTUAL_FOLLOW_FRIENDS" } })
    );
    const info = initCall().body.post_info as Record<string, unknown>;
    expect(info.privacy_level).toBe("MUTUAL_FOLLOW_FRIENDS");
  });
});

describe("tiktokAdapter — failures", () => {
  it("surfaces TikTok's fail_reason", async () => {
    vi.stubGlobal("fetch", tiktokMock({ status: "FAILED", fail_reason: "video_too_long" }));
    await expect(tiktokAdapter.publish(input())).rejects.toThrow(/video_too_long/);
  });
});
