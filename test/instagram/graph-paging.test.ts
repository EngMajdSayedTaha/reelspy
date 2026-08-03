import { describe, it, expect, afterEach, vi } from "vitest";
import {
  AccountUnavailableError,
  fetchAccountReels,
  fetchAccountReelsPage,
} from "@/lib/instagram/graph-api";

// These cover the resumable paging primitive the full-archive pull is built on.
// The property that matters is that a cursor SURVIVES the call: fetchAccountReels
// keeps its cursor on the stack, so when it returns, the position in the
// account's history is gone. fetchAccountReelsPage hands that position back.

type MediaItem = {
  id: string;
  timestamp?: string;
  media_type?: string;
  media_product_type?: string;
};

type PageSpec = { items: MediaItem[]; after?: string };

// Stub Graph responses in order, capturing the `fields` expression of each call
// so tests can assert what was actually asked of Meta.
function stubGraph(pages: PageSpec[]) {
  const calls: string[] = [];
  let i = 0;

  vi.stubGlobal("fetch", async (url: URL | string) => {
    const fields = new URL(String(url)).searchParams.get("fields") ?? "";
    calls.push(fields);
    const page = pages[Math.min(i++, pages.length - 1)];
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        business_discovery: {
          username: "acme",
          followers_count: 42,
          profile_picture_url: "http://a/x.jpg",
          media: {
            data: page.items,
            paging: page.after ? { cursors: { after: page.after } } : {},
          },
        },
      }),
      text: async () => "",
    } as unknown as Response;
  });

  return calls;
}

function reel(id: string, timestamp?: string): MediaItem {
  return { id, timestamp, media_type: "VIDEO", media_product_type: "REELS" };
}

function photo(id: string, timestamp?: string): MediaItem {
  return { id, timestamp, media_type: "IMAGE", media_product_type: "FEED" };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchAccountReelsPage", () => {
  it("returns the cursor so a caller can resume later", async () => {
    stubGraph([{ items: [reel("r1")], after: "CURSOR123" }]);

    const page = await fetchAccountReelsPage("me", "tok", "acme");

    expect(page.nextCursor).toBe("CURSOR123");
    expect(page.reels.map((r) => r.id)).toEqual(["r1"]);
  });

  it("sends a supplied cursor back to Meta as .after(...)", async () => {
    const calls = stubGraph([{ items: [reel("r2")] }]);

    await fetchAccountReelsPage("me", "tok", "acme", { after: "CURSOR123" });

    expect(calls[0]).toContain("media.limit(25).after(CURSOR123)");
  });

  it("rejects a cursor outside Meta's opaque-token alphabet", async () => {
    stubGraph([{ items: [] }]);

    // The cursor is interpolated into the `fields` expression, so a tampered
    // value read back out of storage must never reach the URL.
    await expect(
      fetchAccountReelsPage("me", "tok", "acme", { after: "abc){injected}" })
    ).rejects.toThrow(/invalid media cursor/i);
  });

  it("omits .since() unless asked, and passes only a sanitized integer", async () => {
    const calls = stubGraph([{ items: [reel("r1")] }, { items: [reel("r2")] }]);

    await fetchAccountReelsPage("me", "tok", "acme");
    expect(calls[0]).not.toContain(".since(");

    await fetchAccountReelsPage("me", "tok", "acme", { since: 1690000000.7 });
    expect(calls[1]).toContain(".since(1690000000)");
  });

  it("reports the oldest timestamp across ALL media, not just reels", async () => {
    // A date cutoff that only watched reels would stall on an account whose
    // older history is carousels — the walk must advance on every item.
    stubGraph([
      {
        items: [
          reel("r1", "2026-05-01T00:00:00Z"),
          photo("p1", "2026-01-01T00:00:00Z"),
        ],
      },
    ]);

    const page = await fetchAccountReelsPage("me", "tok", "acme");

    expect(page.oldestPostedAt).toBe("2026-01-01T00:00:00Z");
    expect(page.rawCount).toBe(2);
    expect(page.reels.map((r) => r.id)).toEqual(["r1"]);
  });

  it("treats an empty page as exhausted even when Meta still offers a cursor", async () => {
    stubGraph([{ items: [], after: "STILLHERE" }]);

    const page = await fetchAccountReelsPage("me", "tok", "acme");

    expect(page.nextCursor).toBeUndefined();
  });

  it("throws AccountUnavailableError when the discovery field is absent", async () => {
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({}),
      text: async () => "",
    }) as unknown as Response);

    await expect(fetchAccountReelsPage("me", "tok", "acme")).rejects.toBeInstanceOf(
      AccountUnavailableError
    );
  });
});

describe("fetchAccountReels (unchanged contract, now built on the primitive)", () => {
  it("walks pages until maxReels is reached", async () => {
    stubGraph([
      { items: [reel("r1"), reel("r2")], after: "C1" },
      { items: [reel("r3"), reel("r4")], after: "C2" },
    ]);

    const result = await fetchAccountReels("me", "tok", "acme", 3);

    expect(result.reels.map((r) => r.id)).toEqual(["r1", "r2", "r3"]);
    expect(result.profile?.followers_count).toBe(42);
  });

  it("stops when the cursor runs out and filters non-reels", async () => {
    stubGraph([{ items: [reel("r1"), photo("p1"), reel("r2")] }]);

    const result = await fetchAccountReels("me", "tok", "acme", 50);

    expect(result.reels.map((r) => r.id)).toEqual(["r1", "r2"]);
  });

  it("dedupes a media id repeated across pages", async () => {
    stubGraph([
      { items: [reel("r1")], after: "C1" },
      { items: [reel("r1"), reel("r2")] },
    ]);

    const result = await fetchAccountReels("me", "tok", "acme", 50);

    expect(result.reels.map((r) => r.id)).toEqual(["r1", "r2"]);
  });

  it("surfaces the unavailable verdict instead of a generic failure", async () => {
    // snapshots.ts classifies this wording as `not_found`, which is what stops
    // the account from being retried against an answer that will not change.
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({}),
      text: async () => "",
    }) as unknown as Response);

    const result = await fetchAccountReels("me", "tok", "acme", 25);

    expect(result.reels).toEqual([]);
    expect(result.error).toMatch(/not found, private, or not a Business\/Creator/i);
  });

  it("rejects an invalid username before spending a call", async () => {
    const calls = stubGraph([{ items: [] }]);

    const result = await fetchAccountReels("me", "tok", "bad user!", 25);

    expect(result.error).toMatch(/valid Instagram username/i);
    expect(calls).toHaveLength(0);
  });
});
