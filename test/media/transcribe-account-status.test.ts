import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readTranscribeAccountStatus } from "@/lib/media/transcribe-account-status";

// The bug this file exists to pin: state was derived from the latest `jobs`
// row alone, completely independent of the reel counts sitting right next to
// it. A job row can be stale relative to the reels for a long time — parked
// `queued` with a future run_at from an old throttle/quota defer while the
// last few reels finished through some OTHER path (auto-transcribe picking up
// a released reel, a manual click, or just this run's own final chunk not yet
// reclaimed by the next cron tick). In every one of those cases `remaining`
// is already 0 and correct, but the stale row said "still going" — sometimes
// for hours (a quota-exceeded defer parks for TRANSCRIBE_QUOTA_DEFER_MS = 6h).
// Ground truth (the reel counts) must win.

const USER = "user-1";
const ACCOUNT = "account-1";

type ReelCounts = { total: number; ready: number; failed: number };
type JobRow = { status: string; run_at: string; last_error: string | null } | null;

// A fake scoped to exactly what readTranscribeAccountStatus reads: three
// counting queries over tracked_reels (total / ready / failed) and one lookup
// on jobs. `counts` and `job` are supplied directly rather than modeled as
// real rows, since the function only ever consumes their aggregate shape.
function fakeDb(counts: ReelCounts, job: JobRow): SupabaseClient {
  function reelBuilder() {
    let statusFilter: string | null = null;
    const api = {
      select: () => api,
      eq: (column: string, value: unknown) => {
        if (column === "transcript_status") statusFilter = value as string;
        return api;
      },
      then(resolve: (v: { count: number; error: null }) => void) {
        const count =
          statusFilter === "ready" ? counts.ready : statusFilter === "failed" ? counts.failed : counts.total;
        resolve({ count, error: null });
      },
    };
    return api;
  }

  function jobBuilder() {
    const api = {
      select: () => api,
      eq: () => api,
      in: () => api,
      order: () => api,
      limit: () => api,
      maybeSingle: async () => ({ data: job, error: null }),
    };
    return api;
  }

  return {
    from: (table: string) => (table === "jobs" ? jobBuilder() : reelBuilder()),
  } as unknown as SupabaseClient;
}

describe("readTranscribeAccountStatus", () => {
  // The exact bug report: export shows every reel transcribed, dashboard still
  // says "in progress" because a deferred job row is still sitting `queued`
  // with a future run_at (e.g. a 6h quota-exceeded pause) from before the last
  // reels finished some other way.
  it("reports idle when nothing remains, even with a stale paused job row", async () => {
    const db = fakeDb(
      { total: 576, ready: 576, failed: 0 },
      { status: "queued", run_at: new Date(Date.now() + 5 * 3_600_000).toISOString(), last_error: null }
    );

    const status = await readTranscribeAccountStatus(db, USER, ACCOUNT);

    expect(status.state).toBe("idle");
    expect(status.remaining).toBe(0);
  });

  // Same stale-row problem, different job status: a "running" row left behind
  // by a worker that never got to flip it to done before the reels finished
  // through another path.
  it("reports idle when nothing remains, even with a stale running job row", async () => {
    const db = fakeDb(
      { total: 10, ready: 8, failed: 2 },
      { status: "running", run_at: new Date().toISOString(), last_error: null }
    );

    const status = await readTranscribeAccountStatus(db, USER, ACCOUNT);

    expect(status.state).toBe("idle");
    expect(status.remaining).toBe(0);
  });

  // A failed row must still surface as "failed" — but only while it is telling
  // the truth. `failed` reels count toward completion (a run gives up on a
  // reel and moves on), so 8 ready + 2 failed out of 10 total IS "nothing
  // remains", and there is nothing left to retry.
  it("does not report failed once every reel is accounted for", async () => {
    const db = fakeDb(
      { total: 10, ready: 8, failed: 2 },
      { status: "failed", run_at: new Date().toISOString(), last_error: "exhausted attempts" }
    );

    const status = await readTranscribeAccountStatus(db, USER, ACCOUNT);

    expect(status.state).toBe("idle");
  });

  it("still reports paused while reels genuinely remain", async () => {
    const db = fakeDb(
      { total: 576, ready: 236, failed: 0 },
      { status: "queued", run_at: new Date(Date.now() + 5 * 3_600_000).toISOString(), last_error: "quota" }
    );

    const status = await readTranscribeAccountStatus(db, USER, ACCOUNT);

    expect(status.state).toBe("paused");
    expect(status.remaining).toBe(340);
  });

  it("still reports running while reels genuinely remain", async () => {
    const db = fakeDb({ total: 576, ready: 236, failed: 0 }, { status: "running", run_at: new Date().toISOString(), last_error: null });

    const status = await readTranscribeAccountStatus(db, USER, ACCOUNT);

    expect(status.state).toBe("running");
  });

  it("reports idle with no job row and nothing to do", async () => {
    const db = fakeDb({ total: 5, ready: 5, failed: 0 }, null);

    const status = await readTranscribeAccountStatus(db, USER, ACCOUNT);

    expect(status.state).toBe("idle");
    expect(status.remaining).toBe(0);
  });
});
