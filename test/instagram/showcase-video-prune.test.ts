import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pruneStaleShowcaseVideos } from "@/lib/instagram/showcase-video";

const DAY = 24 * 60 * 60 * 1000;
const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY).toISOString();
const publicUrl = (p: string) => `https://x.supabase.co/storage/v1/object/public/ig-media/${p}`;

function fakeAdmin(files: { name: string; created_at: string }[], removeError: unknown = null) {
  const calls: string[] = [];
  const remove = vi.fn(async () => {
    calls.push("remove");
    return { error: removeError };
  });
  const inFn = vi.fn(async () => {
    calls.push("clear");
    return { error: null };
  });
  const update = vi.fn(() => ({ in: inFn }));
  const admin = {
    storage: {
      from: () => ({
        list: async () => ({ data: files, error: null }),
        getPublicUrl: (p: string) => ({ data: { publicUrl: publicUrl(p) } }),
        remove,
      }),
    },
    from: () => ({ update }),
  } as unknown as SupabaseClient;
  return { admin, remove, update, inFn, calls };
}

describe("pruneStaleShowcaseVideos", () => {
  it("removes only videos older than the lookback and clears their video_url first", async () => {
    const { admin, remove, update, inFn, calls } = fakeAdmin([
      { name: "old.mp4", created_at: iso(40) },
      { name: "fresh.mp4", created_at: iso(3) },
    ]);

    expect(await pruneStaleShowcaseVideos(admin)).toBe(1);

    expect(update).toHaveBeenCalledWith({ video_url: null });
    expect(inFn).toHaveBeenCalledWith("video_url", [publicUrl("videos/old.mp4")]);
    expect(remove).toHaveBeenCalledWith(["videos/old.mp4"]);
    expect(calls).toEqual(["clear", "remove"]);
  });

  it("does nothing when everything is recent", async () => {
    const { admin, remove, update } = fakeAdmin([{ name: "fresh.mp4", created_at: iso(1) }]);
    expect(await pruneStaleShowcaseVideos(admin)).toBe(0);
    expect(update).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("reports zero when the delete fails so the files are retried next run", async () => {
    const { admin } = fakeAdmin([{ name: "old.mp4", created_at: iso(40) }], { message: "boom" });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await pruneStaleShowcaseVideos(admin)).toBe(0);
  });
});
