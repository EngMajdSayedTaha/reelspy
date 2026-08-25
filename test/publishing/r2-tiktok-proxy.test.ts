import { beforeEach, describe, expect, it, vi } from "vitest";
import { presignTikTokUrl, verifyMediaProxySignature } from "@/lib/storage/r2";

function stubR2Creds() {
  vi.stubEnv("R2_ACCOUNT_ID", "acct");
  vi.stubEnv("R2_ACCESS_KEY_ID", "key");
  vi.stubEnv("R2_SECRET_ACCESS_KEY", "secret");
  vi.stubEnv("R2_BUCKET", "publish-media");
}

beforeEach(() => {
  vi.unstubAllEnvs();
});

describe("presignTikTokUrl — no Custom Domain, CRON_SECRET set", () => {
  it("returns a signed media-proxy URL on the app's own origin", async () => {
    stubR2Creds();
    vi.stubEnv("CRON_SECRET", "test-secret");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://app.reelspy.dev");

    const url = await presignTikTokUrl("user-1/video.mp4", 1800);
    const parsed = new URL(url);

    expect(parsed.origin).toBe("https://app.reelspy.dev");
    expect(parsed.pathname).toBe("/api/publishing/media-proxy");
    expect(parsed.searchParams.get("key")).toBe("user-1/video.mp4");
    expect(parsed.searchParams.get("sig")).toBeTruthy();
  });

  it("round-trips through verifyMediaProxySignature", async () => {
    stubR2Creds();
    vi.stubEnv("CRON_SECRET", "test-secret");

    const url = new URL(await presignTikTokUrl("user-1/video.mp4", 1800));
    const key = url.searchParams.get("key")!;
    const exp = Number(url.searchParams.get("exp"));
    const sig = url.searchParams.get("sig")!;

    expect(verifyMediaProxySignature(key, exp, sig)).toBe(true);
  });

  it("rejects a tampered key", async () => {
    stubR2Creds();
    vi.stubEnv("CRON_SECRET", "test-secret");

    const url = new URL(await presignTikTokUrl("user-1/video.mp4", 1800));
    const exp = Number(url.searchParams.get("exp"));
    const sig = url.searchParams.get("sig")!;

    expect(verifyMediaProxySignature("someone-elses/video.mp4", exp, sig)).toBe(false);
  });

  it("rejects an expired signature", async () => {
    stubR2Creds();
    vi.stubEnv("CRON_SECRET", "test-secret");

    // Signed to have already expired.
    const url = new URL(await presignTikTokUrl("user-1/video.mp4", -10));
    const key = url.searchParams.get("key")!;
    const exp = Number(url.searchParams.get("exp"));
    const sig = url.searchParams.get("sig")!;

    expect(verifyMediaProxySignature(key, exp, sig)).toBe(false);
  });

  it("never verifies once CRON_SECRET is unset, even with a previously-valid triple", async () => {
    stubR2Creds();
    vi.stubEnv("CRON_SECRET", "test-secret");
    const url = new URL(await presignTikTokUrl("user-1/video.mp4", 1800));
    const key = url.searchParams.get("key")!;
    const exp = Number(url.searchParams.get("exp"));
    const sig = url.searchParams.get("sig")!;

    vi.stubEnv("CRON_SECRET", "");
    expect(verifyMediaProxySignature(key, exp, sig)).toBe(false);
  });
});

describe("presignTikTokUrl — R2_PUBLIC_BASE_URL set", () => {
  it("uses the Custom Domain directly instead of the proxy", async () => {
    stubR2Creds();
    vi.stubEnv("CRON_SECRET", "test-secret");
    vi.stubEnv("R2_PUBLIC_BASE_URL", "https://media.reelspy.dev");

    const url = await presignTikTokUrl("user-1/video.mp4", 1800);
    expect(url).toBe("https://media.reelspy.dev/user-1/video.mp4");
  });
});

describe("presignTikTokUrl — no Custom Domain and no CRON_SECRET", () => {
  it("falls back to a raw signed R2 URL, same as every other platform gets", async () => {
    stubR2Creds();

    const url = new URL(await presignTikTokUrl("user-1/video.mp4", 1800));
    expect(url.hostname).toBe("acct.r2.cloudflarestorage.com");
  });
});
