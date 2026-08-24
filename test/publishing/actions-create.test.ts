import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));

const getUser = vi.fn(async () => ({ data: { user: { id: "user-1" } } }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));

type Insert = { table: string; rows: Record<string, unknown>[] };
const inserts: Insert[] = [];

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      insert: (payload: Record<string, unknown> | Record<string, unknown>[]) => {
        const rows = Array.isArray(payload) ? payload : [payload];
        inserts.push({ table, rows });
        const result = { data: { id: "post-1" }, error: null };
        return {
          select: () => ({
            single: async () => result,
            maybeSingle: async () => result,
          }),
          then: (resolve: (v: unknown) => unknown) =>
            Promise.resolve({ data: null, error: null }).then(resolve),
        };
      },
      delete: () => ({ eq: async () => ({ data: null, error: null }) }),
    }),
  }),
}));

const enqueueJob = vi.fn<
  (admin: unknown, input: Record<string, unknown>) => Promise<{ id: string; skipped: boolean }>
>(async () => ({ id: "job-1", skipped: false }));
vi.mock("@/lib/jobs/queue", () => ({
  enqueueJob: (admin: unknown, input: Record<string, unknown>) => enqueueJob(admin, input),
}));

const kickPublishWorker = vi.fn<(postId: string) => void>();
vi.mock("@/lib/publishing/kick", () => ({
  kickPublishWorker: (postId: string) => kickPublishWorker(postId),
}));

vi.mock("@/lib/publishing/token-store", () => ({
  getConnection: vi.fn(async () => ({ id: "conn-1", access_token: "tok", token_status: "active" })),
}));

const getIgCredentials = vi.fn(
  async (): Promise<{ token: string; igUserId: string } | null> => ({ token: "ig", igUserId: "ig-1" })
);
const getPageCredentials = vi.fn(
  async (): Promise<{ pageToken: string; pageId: string } | null> => ({ pageToken: "pg", pageId: "page-1" })
);
vi.mock("@/lib/instagram/token-store", () => ({
  getIgCredentials: () => getIgCredentials(),
  getPageCredentials: () => getPageCredentials(),
}));

const readPlatformsFlag = vi.fn(async () => ({
  instagram: true,
  facebook: true,
  tiktok: true,
  youtube: true,
  threads: true,
}));
vi.mock("@/lib/publishing/platforms-flag", () => ({
  readPlatformsFlag: () => readPlatformsFlag(),
}));

vi.mock("@/lib/publishing/media", () => ({
  listPublishMediaPaths: vi.fn(async () => []),
}));
vi.mock("@/lib/storage/r2", () => ({ deleteR2Object: vi.fn(async () => {}) }));

const { createPublishPost } = await import("@/app/dashboard/publishing/actions");

type MediaInput = {
  path: string;
  kind: "image" | "video";
  mimeType: string;
  bytes?: number | null;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  altText?: string | null;
};

const jpeg: MediaInput = {
  path: "user-1/a.jpg",
  kind: "image",
  mimeType: "image/jpeg",
  bytes: 500_000,
  width: 1080,
  height: 1350,
  durationSeconds: null,
};

const mp4: MediaInput = {
  path: "user-1/a.mp4",
  kind: "video",
  mimeType: "video/mp4",
  bytes: 5_000_000,
  width: 1080,
  height: 1920,
  durationSeconds: 20,
};

function rowsFor(table: string) {
  return inserts.filter((i) => i.table === table).flatMap((i) => i.rows);
}

beforeEach(() => {
  inserts.length = 0;
  enqueueJob.mockClear();
  kickPublishWorker.mockClear();
  getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
});

describe("createPublishPost — queueing", () => {
  it("enqueues instead of publishing inline, and pokes the worker for a post-now", async () => {
    const result = await createPublishPost({
      media: [mp4],
      platforms: ["instagram"],
      privacy: "public",
      coverIndex: 0,
    });

    expect(result).toEqual({ postId: "post-1", publishedNow: true });
    // The whole point: the action returns in milliseconds and the durable queue
    // does the platform round-trips.
    expect(enqueueJob).toHaveBeenCalledOnce();
    expect(enqueueJob.mock.calls[0][1]).toMatchObject({
      kind: "publish_post",
      payload: { post_id: "post-1" },
      dedupKey: "publish:post-1",
    });
    expect(kickPublishWorker).toHaveBeenCalledWith("post-1");
  });

  it("does not poke the worker for a scheduled post", async () => {
    const later = new Date(Date.now() + 86_400_000).toISOString();
    const result = await createPublishPost({
      media: [mp4],
      platforms: ["instagram"],
      privacy: "public",
      coverIndex: 0,
      scheduledAt: later,
    });

    expect(result.publishedNow).toBe(false);
    expect(enqueueJob.mock.calls[0][1]).toMatchObject({ runAt: later });
    expect(kickPublishWorker).not.toHaveBeenCalled();
  });
});

describe("createPublishPost — rows written", () => {
  it("writes one publish_media row per slide, in order", async () => {
    await createPublishPost({
      media: [jpeg, { ...jpeg, path: "user-1/b.jpg", altText: "second" }],
      platforms: ["instagram"],
      privacy: "public",
      coverIndex: 1,
    });

    const media = rowsFor("publish_media");
    expect(media).toHaveLength(2);
    expect(media[0]).toMatchObject({ position: 0, storage_path: "user-1/a.jpg", alt_text: null });
    expect(media[1]).toMatchObject({ position: 1, storage_path: "user-1/b.jpg", alt_text: "second" });

    const post = rowsFor("publish_posts")[0];
    expect(post).toMatchObject({ media_kind: "carousel", cover_index: 1 });
    // A carousel has no single legacy video path.
    expect(post.video_path).toBeNull();
  });

  it("keeps video_path populated for a single video, for the legacy readers", async () => {
    await createPublishPost({
      media: [mp4],
      platforms: ["instagram"],
      privacy: "public",
      coverIndex: 0,
    });
    expect(rowsFor("publish_posts")[0]).toMatchObject({
      media_kind: "video",
      video_path: "user-1/a.mp4",
    });
  });

  it("writes one job per target, with the connection id only where one exists", async () => {
    await createPublishPost({
      media: [mp4],
      platforms: ["instagram", "tiktok"],
      privacy: "public",
      coverIndex: 0,
    });

    const jobs = rowsFor("publish_jobs");
    expect(jobs).toHaveLength(2);
    // IG credentials live on `profiles`, so its job carries no connection_id.
    expect(jobs.find((j) => j.platform === "instagram")).toMatchObject({ connection_id: null });
    expect(jobs.find((j) => j.platform === "tiktok")).toMatchObject({ connection_id: "conn-1" });
  });

  it("attaches a per-platform caption override to that platform's job only", async () => {
    await createPublishPost({
      media: [mp4],
      platforms: ["instagram", "tiktok"],
      caption: "shared",
      captions: { instagram: "ig only" },
      privacy: "public",
      coverIndex: 0,
    });

    const jobs = rowsFor("publish_jobs");
    expect(jobs.find((j) => j.platform === "instagram")).toMatchObject({ caption: "ig only" });
    expect(jobs.find((j) => j.platform === "tiktok")).toMatchObject({ caption: null });
  });
});

describe("createPublishPost — server-side gates", () => {
  it("re-runs the composer's validation, so a tampered request can't queue a bad job", async () => {
    // A photo can never reach YouTube; the composer blocks it, and so must this.
    await expect(
      createPublishPost({
        media: [jpeg],
        platforms: ["youtube"],
        privacy: "public",
        coverIndex: 0,
      })
    ).rejects.toThrow(/can't post a photo/i);

    expect(inserts).toHaveLength(0);
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it("rejects an over-long carousel for the platform that can't take it", async () => {
    const eleven = Array.from({ length: 11 }, (_, i) => ({ ...jpeg, path: `user-1/${i}.jpg` }));
    await expect(
      createPublishPost({
        media: eleven,
        platforms: ["instagram"],
        privacy: "public",
        coverIndex: 0,
      })
    ).rejects.toThrow(/10 slides/i);
  });

  it("refuses a platform the founder switched off", async () => {
    readPlatformsFlag.mockResolvedValueOnce({
      instagram: false,
      facebook: true,
      tiktok: true,
      youtube: true,
      threads: true,
    });

    await expect(
      createPublishPost({
        media: [mp4],
        platforms: ["instagram"],
        privacy: "public",
        coverIndex: 0,
      })
    ).rejects.toThrow(/none of the selected platforms/i);
  });

  it("refuses a platform the user hasn't connected", async () => {
    getIgCredentials.mockResolvedValueOnce(null);
    await expect(
      createPublishPost({
        media: [mp4],
        platforms: ["instagram"],
        privacy: "public",
        coverIndex: 0,
      })
    ).rejects.toThrow(/none of the selected platforms/i);
  });

  it("refuses branded TikTok content aimed at a private audience", async () => {
    await expect(
      createPublishPost({
        media: [mp4],
        platforms: ["tiktok"],
        privacy: "public",
        coverIndex: 0,
        tiktokOptions: {
          privacyLevel: "SELF_ONLY",
          postMode: "direct",
          brandedContent: true,
          brandOrganic: false,
        },
      })
    ).rejects.toThrow(/branded content/i);
  });

  it("requires a signed-in user", async () => {
    getUser.mockResolvedValue({ data: { user: null } } as never);
    await expect(
      createPublishPost({
        media: [mp4],
        platforms: ["instagram"],
        privacy: "public",
        coverIndex: 0,
      })
    ).rejects.toThrow(/unauthorized/i);
  });

  it("requires at least one slide", async () => {
    await expect(
      createPublishPost({
        media: [],
        platforms: ["instagram"],
        privacy: "public",
        coverIndex: 0,
      })
    ).rejects.toThrow();
  });
});
