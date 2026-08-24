import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn(async () => ({ data: { user: { id: "user-1" } } }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));

const r2Configured = vi.fn(() => true);
const presignPutUrl = vi.fn<(key: string, contentType: string) => Promise<string>>(
  async (key) => `https://r2.example.com/${key}?sig=1`
);
vi.mock("@/lib/storage/r2", () => ({
  r2Configured: () => r2Configured(),
  presignPutUrl: (key: string, contentType: string) => presignPutUrl(key, contentType),
}));

const consumeUserAction = vi.fn(async () => ({ allowed: true, retryAfterSeconds: 0 }));
vi.mock("@/lib/utils/user-rate-limit", () => ({
  consumeUserAction: () => consumeUserAction(),
  rateLimitMessage: (action: string, secs: number) => `slow down (${action}, ${secs}s)`,
}));

const { POST } = await import("@/app/api/publishing/upload/route");

function request(body: unknown) {
  return new Request("https://app.example.com/api/publishing/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.unstubAllEnvs();
  getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  r2Configured.mockReturnValue(true);
  consumeUserAction.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
  presignPutUrl.mockClear();
  consumeUserAction.mockClear();
});

describe("POST /api/publishing/upload", () => {
  it("rejects an anonymous caller", async () => {
    getUser.mockResolvedValue({ data: { user: null } } as never);
    const res = await POST(request({ contentType: "video/mp4" }));
    expect(res.status).toBe(401);
  });

  it("issues a presigned URL for a video, namespaced under the user", async () => {
    const res = await POST(request({ contentType: "video/mp4", fileName: "reel.mp4" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.kind).toBe("video");
    // Objects are namespaced per user so deletes and listing can be scoped.
    expect(body.path).toMatch(/^user-1\/[0-9a-f-]{36}\.mp4$/);
    expect(body.uploadUrl).toContain("https://r2.example.com/");
  });

  it("accepts the image types carousels need", async () => {
    for (const [contentType, ext] of [
      ["image/jpeg", "jpg"],
      ["image/png", "png"],
      ["image/webp", "webp"],
    ]) {
      const res = await POST(request({ contentType }));
      const body = await res.json();
      expect(res.status, contentType).toBe(200);
      expect(body.kind).toBe("image");
      expect(body.path.endsWith(`.${ext}`), body.path).toBe(true);
    }
  });

  it("rejects a type no platform accepts", async () => {
    const res = await POST(request({ contentType: "application/pdf" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("Unsupported") });
    // A bad type must not burn the user's presign quota.
    expect(consumeUserAction).not.toHaveBeenCalled();
  });

  it("rejects a file over the size ceiling before signing anything", async () => {
    vi.stubEnv("PUBLISH_MAX_IMAGE_MB", "25");
    const res = await POST(
      request({ contentType: "image/jpeg", bytes: 30 * 1024 * 1024 })
    );
    expect(res.status).toBe(413);
    expect(presignPutUrl).not.toHaveBeenCalled();
  });

  it("allows a large video under its much higher ceiling", async () => {
    vi.stubEnv("PUBLISH_MAX_VIDEO_MB", "2048");
    const res = await POST(request({ contentType: "video/mp4", bytes: 500 * 1024 * 1024 }));
    expect(res.status).toBe(200);
  });

  it("passes the rate limiter's Retry-After straight through", async () => {
    consumeUserAction.mockResolvedValue({ allowed: false, retryAfterSeconds: 42 });
    const res = await POST(request({ contentType: "video/mp4" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
  });

  it("explains itself when storage isn't configured", async () => {
    r2Configured.mockReturnValue(false);
    const res = await POST(request({ contentType: "video/mp4" }));
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("R2_") });
  });

  it("rejects a malformed body", async () => {
    const res = await POST(
      new Request("https://app.example.com/api/publishing/upload", {
        method: "POST",
        body: "not json",
      })
    );
    expect(res.status).toBe(400);
  });
});
