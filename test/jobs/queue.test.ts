import { describe, it, expect, afterEach, vi } from "vitest";
import { backoffMs } from "@/lib/jobs/queue";

// backoffMs is the queue's retry schedule — pure, env-tunable, and the thing
// that keeps a failing job from hammering an external API. `attempts` is already
// incremented at claim time, so attempts=1 is the first failure.
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("backoffMs — exponential with cap", () => {
  it("first failure waits the base delay", () => {
    expect(backoffMs(1)).toBe(60_000);
  });

  it("doubles each subsequent attempt", () => {
    expect(backoffMs(2)).toBe(120_000);
    expect(backoffMs(3)).toBe(240_000);
    expect(backoffMs(4)).toBe(480_000);
  });

  it("clamps at the 1h cap so retries never drift beyond an hour", () => {
    // 60s * 2^9 = 30720s > cap → capped at 3_600_000ms.
    expect(backoffMs(10)).toBe(3_600_000);
    expect(backoffMs(50)).toBe(3_600_000);
  });

  it("treats attempts <= 0 as the base delay (never negative exponent)", () => {
    expect(backoffMs(0)).toBe(60_000);
    expect(backoffMs(-5)).toBe(60_000);
  });

  it("honors env overrides for base and cap", () => {
    vi.stubEnv("JOBS_BACKOFF_BASE_MS", "1000");
    vi.stubEnv("JOBS_BACKOFF_CAP_MS", "5000");
    expect(backoffMs(1)).toBe(1000);
    expect(backoffMs(2)).toBe(2000);
    expect(backoffMs(3)).toBe(4000);
    expect(backoffMs(4)).toBe(5000); // 8000 clamped to 5000
  });
});
