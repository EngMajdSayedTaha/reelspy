import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// runTranscribeReel is shared by three callers — the manual "Generate" button,
// post-sync auto-transcribe, and the bulk account job — and they must NOT all
// pace against the same hourly bucket. If they did, a bulk run moving 60
// reels/hour would also exhaust the 20/hour bucket the manual button checks
// against, throttling a feature the user never touched. This test pins the one
// thing that prevents that: which action name reaches consumeUserAction.

// Typed as a 3-arg tuple so the wrapper below can pass all three args through;
// vi.fn would otherwise infer a zero-arg mock from the return value alone.
const consumeUserAction = vi.fn(async (..._args: [unknown, string, string]) => ({
  allowed: true,
  retryAfterSeconds: 0,
}));

vi.mock("@/lib/utils/user-rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/utils/user-rate-limit")>(
    "@/lib/utils/user-rate-limit"
  );
  return {
    ...actual,
    consumeUserAction: (admin: unknown, userId: string, action: string) =>
      consumeUserAction(admin, userId, action),
  };
});

vi.mock("@/lib/billing/resolve", () => ({
  resolveUserEntitlements: async () => ({ entitlements: {}, tier: "free" }),
}));

vi.mock("@/lib/billing/quota", () => ({
  consumeMonthlyQuota: async () => ({ allowed: true, used: 0, remaining: -1, limit: -1, resetAt: null }),
}));

vi.mock("@/lib/media/pipeline", () => ({
  processReel: async () => ({
    status: "ready",
    text: "hello world",
    language: "en",
    source: "groq",
    srt: null,
    metadata: {},
  }),
}));

vi.mock("@/lib/analytics/track", () => ({ track: async () => {} }));

const { runTranscribeReel } = await import("@/lib/media/transcribe-job");

const USER = "user-1";
const REEL = "reel-1";

function fakeAdmin(): SupabaseClient {
  const reel = { id: REEL, ig_permalink: "https://instagram.com/reel/x", transcript_status: null };
  const builder = {
    select: () => builder,
    eq: () => builder,
    update: () => builder,
    maybeSingle: async () => ({ data: reel, error: null }),
    then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
  };
  return { from: () => builder } as unknown as SupabaseClient;
}

beforeEach(() => {
  consumeUserAction.mockClear();
  process.env.GROQ_API_KEY = "test-key";
});

describe("runTranscribeReel rate-limit bucket selection", () => {
  it("defaults to the manual/auto bucket when no override is given", async () => {
    await runTranscribeReel(fakeAdmin(), REEL, USER);

    expect(consumeUserAction).toHaveBeenCalledWith(expect.anything(), USER, "transcript");
  });

  it("uses the bulk bucket when the account job asks for it", async () => {
    await runTranscribeReel(fakeAdmin(), REEL, USER, "transcript_bulk");

    expect(consumeUserAction).toHaveBeenCalledWith(expect.anything(), USER, "transcript_bulk");
  });
});
