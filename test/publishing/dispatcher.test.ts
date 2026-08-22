import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// Everything the dispatcher reaches for, stubbed at the module boundary. The
// point of these tests is the dispatcher's own decisions — which jobs run, what
// a failure is written as, what the post's status ends up being.
type PublishCall = (
  platform: string,
  input: Record<string, unknown>
) => Promise<{ remoteId: string; remoteUrl: string | null }>;

const publishMock = vi.fn<PublishCall>();

vi.mock("@/lib/publishing/adapters/instagram", () => ({
  instagramAdapter: {
    publish: (input: Record<string, unknown>) => publishMock("instagram", input),
  },
}));
vi.mock("@/lib/publishing/adapters/facebook", () => ({
  facebookAdapter: {
    publish: (input: Record<string, unknown>) => publishMock("facebook", input),
  },
}));
vi.mock("@/lib/publishing/adapters/tiktok", () => ({
  tiktokAdapter: {
    publish: (input: Record<string, unknown>) => publishMock("tiktok", input),
  },
}));
vi.mock("@/lib/publishing/adapters/youtube", () => ({
  youtubeAdapter: {
    publish: (input: Record<string, unknown>) => publishMock("youtube", input),
  },
}));
vi.mock("@/lib/publishing/adapters/threads", () => ({
  threadsAdapter: {
    publish: (input: Record<string, unknown>) => publishMock("threads", input),
  },
}));

vi.mock("@/lib/publishing/media", () => ({
  loadPublishMedia: vi.fn(async () => [
    {
      position: 0,
      kind: "video",
      url: "https://media.example.com/0.mp4",
      mimeType: "video/mp4",
      altText: null,
    },
  ]),
}));

vi.mock("@/lib/instagram/token-store", () => ({
  getIgCredentials: vi.fn(async () => ({ token: "ig-tok", igUserId: "ig-1" })),
  getPageCredentials: vi.fn(async () => ({ pageToken: "pg-tok", pageId: "page-1" })),
}));

vi.mock("@/lib/publishing/oauth-token", () => ({
  resolveOAuthAccessToken: vi.fn(async () => ({
    accessToken: "oauth-tok",
    connection: { account_id: "acct-1", account_username: "creator" },
  })),
}));

const notifyPublishFailure = vi.fn<(params: { published: number }) => Promise<boolean>>(
  async () => true
);
vi.mock("@/lib/email/publish-failure", () => ({
  notifyPublishFailure: (params: { published: number }) => notifyPublishFailure(params),
}));

const notifyAdmins = vi.fn(async () => {});
vi.mock("@/lib/notifications/notify", () => ({
  notifyAdmins: () => notifyAdmins(),
}));

vi.mock("@/lib/analytics/track", () => ({ track: vi.fn(async () => {}) }));

const { dispatchPost, isRetryableFailure } = await import("@/lib/publishing/dispatcher");

type JobRow = {
  id: string;
  post_id: string;
  platform: string;
  connection_id: string | null;
  privacy: string;
  status: string;
  attempts: number;
  caption: string | null;
  platform_options: unknown;
  // Written by the dispatcher, absent until then.
  remote_id?: string | null;
  remote_url?: string | null;
  error_message?: string | null;
};

function job(over: Partial<JobRow> = {}): JobRow {
  return {
    id: `job-${over.platform ?? "instagram"}`,
    post_id: "post-1",
    platform: "instagram",
    connection_id: null,
    privacy: "public",
    status: "pending",
    attempts: 0,
    caption: null,
    platform_options: null,
    ...over,
  };
}

/**
 * A tiny stand-in that keeps real rows, so a status written by the per-job loop
 * is visible to the roll-up query at the end — which is the whole thing being
 * tested. Modelled on the hand-rolled fake in test/jobs/defer.test.ts.
 */
function fakeAdmin(post: Record<string, unknown>, jobs: JobRow[]) {
  const state = { post: { ...post }, jobs: jobs.map((j) => ({ ...j })) };

  function builder(table: string) {
    const eqs: Array<[string, unknown]> = [];
    let patch: Record<string, unknown> | null = null;

    const matches = (row: Record<string, unknown>) =>
      eqs.every(([col, val]) => row[col] === val);

    const run = async () => {
      if (patch) {
        if (table === "publish_jobs") {
          for (const row of state.jobs) if (matches(row)) Object.assign(row, patch);
        } else if (matches(state.post)) {
          Object.assign(state.post, patch);
        }
        return { data: null, error: null };
      }
      const data = table === "publish_jobs" ? state.jobs.filter(matches) : [state.post];
      return { data, error: null };
    };

    const b = {
      select: () => b,
      returns: () => b,
      eq: (col: string, val: unknown) => {
        eqs.push([col, val]);
        return b;
      },
      update: (next: Record<string, unknown>) => {
        patch = next;
        return b;
      },
      maybeSingle: async () => {
        const { data } = await run();
        const rows = data as Record<string, unknown>[] | null;
        return { data: rows?.[0] ?? null, error: null };
      },
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        run().then(resolve, reject),
    };
    return b;
  }

  return {
    state,
    client: {
      from: (table: string) => builder(table),
      auth: { admin: { getUserById: async () => ({ data: { user: { email: "u@example.com" } } }) } },
    } as unknown as SupabaseClient,
  };
}

const basePost = {
  id: "post-1",
  user_id: "user-1",
  title: null,
  caption: "hello",
  hashtags: null,
  video_path: "user-1/a.mp4",
  media_kind: "video",
  cover_index: 0,
  cover_ms: null,
  status: "scheduled",
};

beforeEach(() => {
  publishMock.mockReset();
  notifyPublishFailure.mockClear();
  notifyAdmins.mockClear();
});

describe("isRetryableFailure", () => {
  it("treats rate limits, timeouts and 5xx as worth another pass", () => {
    for (const message of [
      "Instagram API error (503)",
      "Instagram API error (429)",
      "TimeoutError: The operation was aborted",
      "Instagram is still processing the media. It will be retried shortly.",
      "Request limit reached",
      "fetch failed",
      "socket hang up",
      "Instagram's 24-hour publishing limit is used up (50/50 posts).",
    ]) {
      expect(isRetryableFailure(message), message).toBe(true);
    }
  });

  it("treats a rejected token or rejected content as terminal", () => {
    for (const message of [
      "Error validating access token: the session has been invalidated",
      "Instagram API error (400): caption too long",
      "TikTok publish failed: video_too_long",
      "YouTube can only publish a single video.",
    ]) {
      expect(isRetryableFailure(message), message).toBe(false);
    }
  });
});

describe("dispatchPost", () => {
  it("runs only pending jobs — an already-published target is never re-posted", async () => {
    const { client, state } = fakeAdmin(basePost, [
      job({ id: "job-ig", platform: "instagram", status: "published" }),
      job({ id: "job-tt", platform: "tiktok", status: "pending" }),
    ]);
    publishMock.mockResolvedValue({ remoteId: "r1", remoteUrl: null });

    const result = await dispatchPost(client, "post-1");

    expect(publishMock).toHaveBeenCalledTimes(1);
    expect(publishMock.mock.calls[0][0]).toBe("tiktok");
    expect(result).toMatchObject({ published: 1, failed: 0, deferred: 0 });
    expect(state.post.status).toBe("done");
  });

  it("does nothing when there is no pending work", async () => {
    const { client } = fakeAdmin(basePost, [
      job({ id: "job-ig", platform: "instagram", status: "published" }),
    ]);

    const result = await dispatchPost(client, "post-1");

    expect(publishMock).not.toHaveBeenCalled();
    expect(result).toEqual({ postId: "post-1", published: 0, failed: 0, deferred: 0 });
  });

  it("writes the remote id and url back per job", async () => {
    const { client, state } = fakeAdmin(basePost, [job({ id: "job-ig" })]);
    publishMock.mockResolvedValue({ remoteId: "media-9", remoteUrl: "https://ig/p/9" });

    await dispatchPost(client, "post-1");

    expect(state.jobs[0]).toMatchObject({
      status: "published",
      remote_id: "media-9",
      remote_url: "https://ig/p/9",
      error_message: null,
    });
  });

  it("leaves a transient failure PENDING so the queue retries it", async () => {
    const { client, state } = fakeAdmin(basePost, [job({ id: "job-ig" })]);
    publishMock.mockRejectedValue(new Error("Instagram API error (503)"));

    const result = await dispatchPost(client, "post-1");

    // Burning it to `failed` would make the user press Retry for something that
    // needed a minute.
    expect(state.jobs[0].status).toBe("pending");
    expect(result).toMatchObject({ failed: 0, deferred: 1 });
    // A post with work still queued is still publishing — not done, not failed.
    expect(state.post.status).toBe("publishing");
    // And the user isn't emailed about something that hasn't failed yet.
    expect(notifyPublishFailure).not.toHaveBeenCalled();
  });

  it("writes a terminal failure as failed and emails the user", async () => {
    const { client, state } = fakeAdmin(basePost, [job({ id: "job-ig" })]);
    publishMock.mockRejectedValue(new Error("Instagram API error (400): caption too long"));

    const result = await dispatchPost(client, "post-1");

    expect(state.jobs[0].status).toBe("failed");
    expect(state.jobs[0].error_message).toContain("caption too long");
    expect(result).toMatchObject({ failed: 1, deferred: 0 });
    expect(state.post.status).toBe("failed");
    expect(notifyPublishFailure).toHaveBeenCalledOnce();
    expect(notifyAdmins).toHaveBeenCalledOnce();
  });

  it("reports `partial` when some targets land and others don't", async () => {
    const { client, state } = fakeAdmin(basePost, [
      job({ id: "job-ig", platform: "instagram" }),
      job({ id: "job-yt", platform: "youtube" }),
    ]);
    publishMock.mockImplementation(async (platform: string) => {
      if (platform === "youtube") throw new Error("YouTube can only publish a single video.");
      return { remoteId: "r", remoteUrl: null };
    });

    const result = await dispatchPost(client, "post-1");

    expect(result).toMatchObject({ published: 1, failed: 1 });
    expect(state.post.status).toBe("partial");
    // The email's "published" count is across ALL targets, not just this pass.
    expect(notifyPublishFailure.mock.calls[0][0]).toMatchObject({ published: 1 });
  });

  it("counts an attempt even when the job goes back to pending", async () => {
    const { client, state } = fakeAdmin(basePost, [job({ id: "job-ig", attempts: 2 })]);
    publishMock.mockRejectedValue(new Error("fetch failed"));

    await dispatchPost(client, "post-1");

    // Otherwise a target that always times out would retry forever.
    expect(state.jobs[0].attempts).toBe(3);
  });

  it("hands each adapter the post's media and the per-platform caption override", async () => {
    const { client } = fakeAdmin(basePost, [job({ id: "job-ig", caption: "ig-only copy" })]);
    publishMock.mockResolvedValue({ remoteId: "r", remoteUrl: null });

    await dispatchPost(client, "post-1");

    const [, input] = publishMock.mock.calls[0];
    expect(input.mediaKind).toBe("video");
    expect(input.media).toHaveLength(1);
    expect(input.content).toMatchObject({ caption: "ig-only copy" });
  });

  it("falls back to the shared caption when a job has no override", async () => {
    const { client } = fakeAdmin(basePost, [job({ id: "job-ig", caption: null })]);
    publishMock.mockResolvedValue({ remoteId: "r", remoteUrl: null });

    await dispatchPost(client, "post-1");

    const [, input] = publishMock.mock.calls[0];
    expect(input.content).toMatchObject({ caption: "hello" });
  });

  it("only forwards TikTok options to TikTok", async () => {
    const options = { privacyLevel: "SELF_ONLY", postMode: "direct" };
    const { client } = fakeAdmin(basePost, [
      job({ id: "job-tt", platform: "tiktok", platform_options: options }),
      job({ id: "job-ig", platform: "instagram", platform_options: options }),
    ]);
    publishMock.mockResolvedValue({ remoteId: "r", remoteUrl: null });

    await dispatchPost(client, "post-1");

    const byPlatform = Object.fromEntries(
      publishMock.mock.calls.map(([platform, input]) => [platform, input])
    );
    expect(byPlatform.tiktok.tiktokOptions).toEqual(options);
    expect(byPlatform.instagram.tiktokOptions).toBeUndefined();
  });

  it("derives the media kind for a post that predates the media_kind column", async () => {
    const { client } = fakeAdmin({ ...basePost, media_kind: null }, [job({ id: "job-ig" })]);
    publishMock.mockResolvedValue({ remoteId: "r", remoteUrl: null });

    await dispatchPost(client, "post-1");

    const [, input] = publishMock.mock.calls[0];
    expect(input.mediaKind).toBe("video");
  });
});
