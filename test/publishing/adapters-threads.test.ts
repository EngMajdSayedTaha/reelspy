import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { threadsAdapter, refreshThreadsToken } from "@/lib/publishing/adapters/threads";
import type { PublishInput, PublishMediaItem } from "@/lib/publishing/types";

vi.stubEnv("PUBLISH_POLL_INTERVAL_MS", "1");
vi.stubEnv("PUBLISH_CONTAINER_TIMEOUT_MS", "5000");

type Call = { url: string; method: string };
let calls: Call[] = [];

function threadsMock(overrides: { status?: unknown; publish?: unknown } = {}) {
  let seq = 0;
  return vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method });

    const json = (body: unknown, ok = true) =>
      ({
        ok,
        status: ok ? 200 : 400,
        headers: new Headers(),
        json: async () => body,
        text: async () => JSON.stringify(body),
      }) as unknown as Response;

    if (url.includes("/threads_publish")) return json(overrides.publish ?? { id: "th-post-1" });
    if (url.includes("/threads") && method === "POST") {
      seq += 1;
      return json({ id: `th-container-${seq}` });
    }
    if (url.includes("fields=status")) return json(overrides.status ?? { status: "FINISHED" });
    if (url.includes("fields=permalink")) return json({ permalink: "https://threads.net/@me/post/1" });
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
    content: { title: null, caption: "hello threads", hashtags: "" },
    media: [media("image")],
    mediaKind: "image",
    coverIndex: 0,
    coverMs: null,
    creds: { accessToken: "tok", accountId: "th-user-1" },
    privacy: "public",
    ...over,
  };
}

function containerCalls() {
  return calls.filter((c) => c.method === "POST" && c.url.includes("/threads?"));
}

beforeEach(() => {
  calls = [];
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("threadsAdapter — single post", () => {
  it("creates a container, waits for it, then publishes once", async () => {
    vi.stubGlobal("fetch", threadsMock());

    const result = await threadsAdapter.publish(input());

    expect(result).toEqual({ remoteId: "th-post-1", remoteUrl: "https://threads.net/@me/post/1" });

    const create = containerCalls()[0];
    expect(create.url).toContain("media_type=IMAGE");
    expect(create.url).toContain("image_url=");
    expect(create.url).toContain("text=hello+threads");

    // Publishing twice would post twice.
    expect(calls.filter((c) => c.url.includes("/threads_publish"))).toHaveLength(1);
  });

  it("uses VIDEO for a video slide", async () => {
    vi.stubGlobal("fetch", threadsMock());
    await threadsAdapter.publish(input({ mediaKind: "video", media: [media("video")] }));
    expect(containerCalls()[0].url).toContain("media_type=VIDEO");
    expect(containerCalls()[0].url).toContain("video_url=");
  });

  it("truncates the body at Threads' 500-character limit", async () => {
    vi.stubGlobal("fetch", threadsMock());
    await threadsAdapter.publish(
      input({ content: { title: null, caption: "x".repeat(900), hashtags: "" } })
    );

    const text = new URL(containerCalls()[0].url).searchParams.get("text")!;
    expect(text).toHaveLength(500);
  });
});

describe("threadsAdapter — carousel", () => {
  it("builds one child per slide, then a CAROUSEL parent, then publishes once", async () => {
    vi.stubGlobal("fetch", threadsMock());

    const result = await threadsAdapter.publish(
      input({
        mediaKind: "carousel",
        media: [media("image", 0), media("video", 1), media("image", 2)],
      })
    );

    const creates = containerCalls();
    expect(creates).toHaveLength(4); // 3 children + parent

    for (const child of creates.slice(0, 3)) {
      expect(child.url).toContain("is_carousel_item=true");
      expect(child.url).not.toContain("text=");
    }
    // Threads carousels mix photos and video freely.
    expect(creates[1].url).toContain("media_type=VIDEO");

    const parent = creates[3];
    expect(parent.url).toContain("media_type=CAROUSEL");
    expect(parent.url).toContain("children=th-container-1%2Cth-container-2%2Cth-container-3");
    expect(parent.url).toContain("text=hello+threads");

    expect(result.remoteId).toBe("th-post-1");
  });

  it("never publishes when a child errors", async () => {
    vi.stubGlobal(
      "fetch",
      threadsMock({ status: { status: "ERROR", error_message: "bad video" } })
    );

    await expect(
      threadsAdapter.publish(
        input({ mediaKind: "carousel", media: [media("image", 0), media("image", 1)] })
      )
    ).rejects.toThrow(/bad video/);

    expect(calls.filter((c) => c.url.includes("/threads_publish"))).toHaveLength(0);
  });
});

describe("refreshThreadsToken", () => {
  it("refreshes the long-lived access token in place", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        expect(url).toContain("grant_type=th_refresh_token");
        expect(url).toContain("access_token=old-token");
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ access_token: "new-token", expires_in: 5_183_944 }),
          text: async () => "",
        } as unknown as Response;
      })
    );

    const result = await refreshThreadsToken("old-token");
    expect(result.accessToken).toBe("new-token");
    expect(result.expiresInSeconds).toBe(5_183_944);
  });

  it("surfaces the provider's message when the refresh is rejected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        ({
          ok: false,
          status: 400,
          headers: new Headers(),
          json: async () => ({ error: { message: "token expired" } }),
          text: async () => "",
        }) as unknown as Response
      )
    );

    await expect(refreshThreadsToken("old")).rejects.toThrow(/token expired/);
  });
});
