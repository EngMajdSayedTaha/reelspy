import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { instagramAdapter } from "@/lib/publishing/adapters/instagram";
import type { PublishInput, PublishMediaItem } from "@/lib/publishing/types";

// The adapter sleeps between status polls. Rather than advance fake timers from
// inside its own await chain, squeeze the real interval to 1ms — the same env
// knob ops would use to pace it — and let the fetch mock answer FINISHED on the
// first look.
vi.stubEnv("PUBLISH_POLL_INTERVAL_MS", "1");
vi.stubEnv("PUBLISH_CONTAINER_TIMEOUT_MS", "5000");

type Call = { url: string; method: string };

let calls: Call[] = [];

/** Route a Graph request to a canned response by what the URL is asking for. */
function graphMock(overrides: Record<string, unknown> = {}) {
  let containerSeq = 0;

  return vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method });

    const json = (body: unknown, ok = true, status = 200) =>
      ({
        ok,
        status,
        headers: new Headers(),
        json: async () => body,
        text: async () => JSON.stringify(body),
      }) as unknown as Response;

    if (url.includes("/content_publishing_limit")) {
      return json(
        overrides.limit ?? { data: [{ quota_usage: 3, config: { quota_total: 50 } }] }
      );
    }
    if (url.includes("/media_publish")) {
      return json(overrides.publish ?? { id: "published-media-1" });
    }
    if (url.includes("/media") && method === "POST") {
      containerSeq += 1;
      return json({ id: `container-${containerSeq}` });
    }
    // Container status poll, or the permalink lookup.
    if (url.includes("fields=status_code")) {
      return json(overrides.status ?? { status_code: "FINISHED" });
    }
    if (url.includes("fields=permalink")) {
      return json({ permalink: "https://instagram.com/p/abc" });
    }
    return json({});
  });
}

function media(kind: "image" | "video", position = 0): PublishMediaItem {
  return {
    position,
    kind,
    url: `https://media.example.com/${kind}-${position}.${kind === "image" ? "jpg" : "mp4"}`,
    mimeType: kind === "image" ? "image/jpeg" : "video/mp4",
    altText: null,
  };
}

function input(over: Partial<PublishInput> = {}): PublishInput {
  return {
    content: { title: null, caption: "hello", hashtags: "#a" },
    media: [media("video")],
    mediaKind: "video",
    coverIndex: 0,
    coverMs: null,
    creds: { accessToken: "tok", accountId: "ig-1" },
    privacy: "public",
    ...over,
  };
}

function postedMediaCalls() {
  return calls.filter((c) => c.method === "POST" && /\/media(\?|$)/.test(c.url.split("&")[0]));
}

beforeEach(() => {
  calls = [];
  vi.stubEnv("PUBLISH_HTTP_TIMEOUT_MS", "5000");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("instagramAdapter — single video", () => {
  it("creates a REELS container, polls it, and publishes once", async () => {
    vi.stubGlobal("fetch", graphMock());

    const result = await instagramAdapter.publish(input());

    expect(result).toEqual({ remoteId: "published-media-1", remoteUrl: "https://instagram.com/p/abc" });

    const create = calls.find((c) => c.method === "POST" && c.url.includes("/media?"));
    expect(create!.url).toContain("media_type=REELS");
    expect(create!.url).toContain("video_url=");
    expect(create!.url).toContain("caption=hello");

    // Exactly one publish — a second would be a duplicate post.
    expect(calls.filter((c) => c.url.includes("/media_publish"))).toHaveLength(1);
  });

  it("passes the chosen cover frame as thumb_offset", async () => {
    vi.stubGlobal("fetch", graphMock());
    await instagramAdapter.publish(input({ coverMs: 2500 }));

    const create = calls.find((c) => c.method === "POST" && c.url.includes("/media?"));
    expect(create!.url).toContain("thumb_offset=2500");
  });
});

describe("instagramAdapter — single image", () => {
  it("sends image_url and alt_text", async () => {
    vi.stubGlobal("fetch", graphMock());

    await instagramAdapter.publish(
      input({
        mediaKind: "image",
        media: [{ ...media("image"), altText: "a bar chart" }],
      })
    );

    const create = calls.find((c) => c.method === "POST" && c.url.includes("/media?"));
    expect(create!.url).toContain("image_url=");
    expect(create!.url).toContain("alt_text=a+bar+chart");
    expect(create!.url).not.toContain("media_type=REELS");
  });
});

describe("instagramAdapter — carousel", () => {
  it("builds a child per slide, then one parent, then publishes once", async () => {
    vi.stubGlobal("fetch", graphMock());

    const slides = [media("image", 0), media("image", 1), media("video", 2)];
    const result = await instagramAdapter.publish(
      input({ mediaKind: "carousel", media: slides })
    );

    const creates = postedMediaCalls();
    // 3 children + 1 parent.
    expect(creates).toHaveLength(4);

    const children = creates.slice(0, 3);
    for (const child of children) {
      expect(child.url).toContain("is_carousel_item=true");
      // Children carry no caption — only the parent does.
      expect(child.url).not.toContain("caption=");
    }
    // The video child is explicitly typed; image children aren't.
    expect(children[2].url).toContain("media_type=VIDEO");

    const parent = creates[3];
    expect(parent.url).toContain("media_type=CAROUSEL");
    expect(parent.url).toContain("children=container-1%2Ccontainer-2%2Ccontainer-3");
    expect(parent.url).toContain("caption=hello");

    expect(calls.filter((c) => c.url.includes("/media_publish"))).toHaveLength(1);
    expect(result.remoteId).toBe("published-media-1");
  });

  it("aborts before publishing when a child fails to process", async () => {
    vi.stubGlobal("fetch", graphMock({ status: { status_code: "ERROR" } }));

    await expect(
      instagramAdapter.publish({
        ...input({ mediaKind: "carousel", media: [media("image", 0), media("image", 1)] }),
      })
    ).rejects.toThrow(/could not process/i);

    // Nothing was published — a half-built carousel must not go out.
    expect(calls.filter((c) => c.url.includes("/media_publish"))).toHaveLength(0);
  });
});

describe("instagramAdapter — publishing limit pre-flight", () => {
  it("refuses with a readable message when the 24h quota is spent", async () => {
    vi.stubGlobal(
      "fetch",
      graphMock({ limit: { data: [{ quota_usage: 50, config: { quota_total: 50 } }] } })
    );

    await expect(instagramAdapter.publish(input())).rejects.toThrow(
      /24-hour publishing limit/i
    );
    // It gave up before creating anything.
    expect(postedMediaCalls()).toHaveLength(0);
  });

  it("publishes anyway when the limit can't be read", async () => {
    // A diagnostic call failing is not a reason to block someone's post.
    vi.stubGlobal("fetch", graphMock({ limit: {} }));
    const result = await instagramAdapter.publish(input());
    expect(result.remoteId).toBe("published-media-1");
  });
});
