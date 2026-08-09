import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// The bulk run is a chunked walk over an account's untranscribed reels, resumed
// by the worker until nothing is left. Everything worth testing is about how a
// chunk ENDS, because that is what decides whether the run continues, parks, or
// is declared finished — and a wrong ending either strands an account
// half-transcribed or spins the queue forever.

const runTranscribeReel = vi.fn();
const transcriptionConfigured = vi.fn(() => true);

vi.mock("@/lib/media/transcribe-job", () => ({
  runTranscribeReel: (...args: unknown[]) => runTranscribeReel(...args),
  transcriptionConfigured: () => transcriptionConfigured(),
}));

// The inter-reel pace exists to be gentle on Whisper, not to be exercised here;
// it is read once at module load, so it has to be neutralised before the import.
process.env.TRANSCRIBE_ACCOUNT_PACE_MS = "0";

const { runTranscribeAccount } = await import("@/lib/media/transcribe-account-job");

const USER = "user-1";
const ACCOUNT = "account-1";

type Reel = { id: string; transcript_status: string | null };

// A fake scoped to exactly the two tables this job touches. `remaining` is a
// live count over the reels, so the assertions reflect what the job would
// actually read back after transcribing some of them.
function fakeDb(reels: Reel[], opts: { accountMissing?: boolean } = {}) {
  const rows = reels.map((r) => ({ ...r }));

  const pending = () => rows.filter((r) => r.transcript_status == null || r.transcript_status === "none");

  function builder(table: string) {
    let isHeadCount = false;

    const api = {
      select: (_cols: string, options?: { head?: boolean; count?: string }) => {
        isHeadCount = Boolean(options?.head);
        return api;
      },
      eq: () => api,
      or: () => api,
      order: () => api,
      limit: (n: number) => {
        limit = n;
        return api;
      },
      returns: () => api,
      maybeSingle: async () =>
        table === "inspiration_accounts"
          ? { data: opts.accountMissing ? null : { id: ACCOUNT }, error: null }
          : { data: null, error: null },
      then(resolve: (v: { data: unknown; count: number | null; error: unknown }) => void) {
        if (isHeadCount) {
          resolve({ data: null, count: pending().length, error: null });
          return;
        }
        resolve({ data: pending().slice(0, limit), count: null, error: null });
      },
    };
    let limit = rows.length;
    return api;
  }

  return {
    rows,
    client: { from: (table: string) => builder(table) } as unknown as SupabaseClient,
  };
}

// Mirrors what runTranscribeReel does to the row for each outcome, so the
// remaining-count the job reads back is the one production would see.
function outcomeFor(rows: Reel[], results: Record<string, string>) {
  return async (_admin: unknown, reelId: string) => {
    const outcome = results[reelId] ?? "ready";
    const row = rows.find((r) => r.id === reelId);
    if (row) {
      if (outcome === "ready") row.transcript_status = "ready";
      if (outcome === "failed") row.transcript_status = "failed";
      // `throttled` and `quota_exceeded` release the reel back to "none".
    }
    return outcome;
  };
}

beforeEach(() => {
  runTranscribeReel.mockReset();
  transcriptionConfigured.mockReset();
  transcriptionConfigured.mockReturnValue(true);
});

describe("runTranscribeAccount", () => {
  it("reports completed when every reel is transcribed", async () => {
    const db = fakeDb([
      { id: "r1", transcript_status: null },
      { id: "r2", transcript_status: null },
    ]);
    runTranscribeReel.mockImplementation(outcomeFor(db.rows, {}));

    const result = await runTranscribeAccount(db.client, ACCOUNT, USER);

    expect(result.outcome).toBe("completed");
    expect(result.transcribed).toBe(2);
    expect(result.remaining).toBe(0);
  });

  // The chunk size is deliberately small, so a large account MUST come back as
  // "continued" — reporting "completed" here is how a run would silently stop
  // after five reels and never transcribe the rest.
  it("reports continued while reels remain beyond the chunk", async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      id: `r${i}`,
      transcript_status: null,
    }));
    const db = fakeDb(many);
    runTranscribeReel.mockImplementation(outcomeFor(db.rows, {}));

    const result = await runTranscribeAccount(db.client, ACCOUNT, USER);

    expect(result.outcome).toBe("continued");
    expect(result.remaining).toBeGreaterThan(0);
    // Only the chunk ran, not all twelve.
    expect(runTranscribeReel.mock.calls.length).toBeLessThan(many.length);
  });

  it("stops the chunk immediately when the hourly throttle bites", async () => {
    const db = fakeDb([
      { id: "r1", transcript_status: null },
      { id: "r2", transcript_status: null },
      { id: "r3", transcript_status: null },
    ]);
    runTranscribeReel.mockImplementation(outcomeFor(db.rows, { r2: "throttled" }));

    const result = await runTranscribeAccount(db.client, ACCOUNT, USER);

    expect(result.outcome).toBe("throttled");
    // The first reel's transcript is kept — a throttle mid-chunk must not
    // discard the work already paid for.
    expect(result.transcribed).toBe(1);
    // r3 was never attempted: continuing past a throttle just earns more of them.
    expect(runTranscribeReel).toHaveBeenCalledTimes(2);
  });

  it("parks the run when the monthly plan quota is spent", async () => {
    const db = fakeDb([
      { id: "r1", transcript_status: null },
      { id: "r2", transcript_status: null },
    ]);
    runTranscribeReel.mockImplementation(outcomeFor(db.rows, { r1: "quota_exceeded" }));

    const result = await runTranscribeAccount(db.client, ACCOUNT, USER);

    expect(result.outcome).toBe("quota_exceeded");
    expect(result.transcribed).toBe(0);
    expect(result.remaining).toBe(2);
  });

  // One removed reel must not strand the other 500. `failed` is terminal for
  // that row and excluded from later passes, so the run still terminates.
  it("keeps going past a reel that cannot be transcribed", async () => {
    const db = fakeDb([
      { id: "r1", transcript_status: null },
      { id: "r2", transcript_status: null },
      { id: "r3", transcript_status: null },
    ]);
    runTranscribeReel.mockImplementation(outcomeFor(db.rows, { r1: "failed" }));

    const result = await runTranscribeAccount(db.client, ACCOUNT, USER);

    expect(runTranscribeReel).toHaveBeenCalledTimes(3);
    expect(result.transcribed).toBe(2);
    expect(result.outcome).toBe("completed");
    expect(result.remaining).toBe(0);
  });

  it("does nothing when there is nothing left to transcribe", async () => {
    const db = fakeDb([{ id: "r1", transcript_status: "ready" }]);

    const result = await runTranscribeAccount(db.client, ACCOUNT, USER);

    expect(result.outcome).toBe("completed");
    expect(runTranscribeReel).not.toHaveBeenCalled();
  });

  it("skips when no transcription provider is configured", async () => {
    transcriptionConfigured.mockReturnValue(false);
    const db = fakeDb([{ id: "r1", transcript_status: null }]);

    const result = await runTranscribeAccount(db.client, ACCOUNT, USER);

    expect(result.outcome).toBe("skipped");
    expect(runTranscribeReel).not.toHaveBeenCalled();
  });

  // The account can be untracked between queueing the run and running it.
  it("skips when the account is gone", async () => {
    const db = fakeDb([{ id: "r1", transcript_status: null }], { accountMissing: true });

    const result = await runTranscribeAccount(db.client, ACCOUNT, USER);

    expect(result.outcome).toBe("skipped");
    expect(runTranscribeReel).not.toHaveBeenCalled();
  });
});
