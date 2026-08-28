import { describe, it, expect, afterEach, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { archiveCovers } from "@/lib/jobs/archive-account-job";
import { deeperSince, sinceForRange } from "@/lib/instagram/archive-range";

// The archive walks backwards through an account's history across MANY worker
// passes, and every interesting property is about what survives between them:
// the cursor, how deep it has reached, and whether "no more pages" meant the
// account ended or merely that we hit the date we asked for.

// ── A table-aware Supabase fake ─────────────────────────────────────────────
// The shared helper is deliberately table-agnostic, which can't drive a job that
// reads and writes six different tables and depends on what it reads back.

type Row = Record<string, unknown>;
type Filter = { op: "eq" | "in"; column: string; value: unknown };

// Primary keys, so an upsert merges instead of duplicating.
const PRIMARY_KEYS: Record<string, string[]> = {
  ig_account_snapshots: ["ig_username"],
  ig_reel_snapshots: ["ig_username", "ig_media_id"],
  ig_account_archives: ["ig_username"],
  ig_account_archive_requests: ["ig_username", "user_id"],
  profiles: ["id"],
  meta_api_limiter: ["id"],
  inspiration_accounts: ["id"],
  tracked_reels: ["id"],
};

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every((f) =>
    f.op === "eq"
      ? row[f.column] === f.value
      : Array.isArray(f.value) && (f.value as unknown[]).includes(row[f.column])
  );
}

// `missing` names tables that don't exist in this database — every operation on
// them resolves with a Postgres 42P01, exactly as PostgREST reports an
// unapplied migration. This is the shape of the production incident: the code
// read those errors as "no archive yet" and restarted the walk forever.
function fakeDb(tables: Record<string, Row[]>, missing: string[] = []) {
  const store: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(tables)) store[name] = rows.map((r) => ({ ...r }));

  const absent = new Set(missing);
  const relationError = (table: string) => ({
    code: "42P01",
    message: `relation "public.${table}" does not exist`,
  });

  const rowsOf = (table: string) => (store[table] ??= []);

  function upsertRows(table: string, payload: Row | Row[]) {
    const keys = PRIMARY_KEYS[table] ?? [];
    for (const incoming of Array.isArray(payload) ? payload : [payload]) {
      const existing = rowsOf(table).find((r) => keys.every((k) => r[k] === incoming[k]));
      if (existing && keys.length > 0) Object.assign(existing, incoming);
      else rowsOf(table).push({ ...incoming });
    }
  }

  function builder(table: string) {
    const filters: Filter[] = [];
    let pendingUpdate: Row | null = null;

    const api = {
      select: () => api,
      order: () => api,
      limit: () => api,
      range: () => api,
      eq: (column: string, value: unknown) => {
        filters.push({ op: "eq", column, value });
        return api;
      },
      in: (column: string, value: unknown) => {
        filters.push({ op: "in", column, value });
        return api;
      },
      not: () => api,
      returns: () => api,
      maybeSingle: async () =>
        absent.has(table)
          ? { data: null, error: relationError(table) }
          : { data: rowsOf(table).find((r) => matches(r, filters)) ?? null, error: null },
      insert: (payload: Row | Row[]) => {
        if (!absent.has(table)) {
          for (const row of Array.isArray(payload) ? payload : [payload]) {
            rowsOf(table).push({ ...row });
          }
        }
        return {
          then: (resolve: (v: unknown) => void) =>
            resolve({ data: null, error: absent.has(table) ? relationError(table) : null }),
        };
      },
      upsert: (payload: Row | Row[]) => {
        if (!absent.has(table)) upsertRows(table, payload);
        return {
          then: (resolve: (v: unknown) => void) =>
            resolve({ data: null, error: absent.has(table) ? relationError(table) : null }),
        };
      },
      update: (payload: Row) => {
        pendingUpdate = payload;
        return api;
      },
      // `.update(x).eq(...)` only resolves when awaited, which is where the
      // filters are finally known.
      then(resolve: (value: { data: Row[] | null; count: number; error: unknown }) => void) {
        if (absent.has(table)) {
          pendingUpdate = null;
          resolve({ data: null, count: 0, error: relationError(table) });
          return;
        }
        const hits = rowsOf(table).filter((r) => matches(r, filters));
        if (pendingUpdate) {
          for (const row of hits) {
            for (const [k, v] of Object.entries(pendingUpdate)) {
              if (v !== undefined) row[k] = v;
            }
          }
          pendingUpdate = null;
        }
        resolve({ data: hits, count: hits.length, error: null });
      },
    };
    return api;
  }

  return {
    store,
    client: {
      from: (table: string) => builder(table),
      rpc: async () => ({ data: null, error: null }),
    } as unknown as SupabaseClient,
  };
}

// ── Graph stubbing ──────────────────────────────────────────────────────────

type StubPage = { ids: string[]; timestamp: string; after?: string };

function stubGraphPages(pages: StubPage[] | ((call: number) => StubPage)) {
  let call = 0;
  vi.stubGlobal("fetch", async () => {
    const page = typeof pages === "function" ? pages(call) : pages[Math.min(call, pages.length - 1)];
    call += 1;
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        business_discovery: {
          username: "acme",
          followers_count: 10,
          media: {
            data: page.ids.map((id) => ({
              id,
              media_type: "VIDEO",
              media_product_type: "REELS",
              permalink: `https://instagram.com/reel/${id}`,
              timestamp: page.timestamp,
              like_count: 1,
              comments_count: 2,
              view_count: 3,
              thumbnail_url: `https://scontent.cdninstagram.com/${id}.jpg`,
            })),
            paging: page.after ? { cursors: { after: page.after } } : {},
          },
        },
      }),
      text: async () => "",
    } as unknown as Response;
  });
  return () => call;
}

// A connected creator whose token the worker borrows, plus the limiter row.
const BASE_TABLES = {
  profiles: [
    {
      id: "user-1",
      ig_user_id: "ig-1",
      ig_access_token: "tok",
      ig_token_status: "active",
      ig_token_expires_at: null,
      ig_token_refreshed_at: null,
      ig_auth_flow: "facebook_login",
    },
  ],
  meta_api_limiter: [{ id: 1, hourly_budget: 160, throttled_until: null }],
  ig_account_snapshots: [{ ig_username: "acme" }],
};

// The job's tunables are module-level `numEnv` constants, read once at import.
// So a test that needs a different chunk size has to stub the env and then load
// the module — stubbing after the import can't reach a value already computed.
// (numEnv rejects 0, so the pacing floor is 1ms rather than none.)
async function loadJob(env: Record<string, string> = {}) {
  vi.resetModules();
  vi.stubEnv("ARCHIVE_PAGE_PACE_MS", "1");
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  return import("@/lib/jobs/archive-account-job");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("archiveCovers", () => {
  it("treats an exhausted archive as covering any depth", () => {
    expect(archiveCovers({ exhausted: true, oldest_seen_at: null }, "2020-01-01T00:00:00Z")).toBe(
      true
    );
    expect(archiveCovers({ exhausted: true, oldest_seen_at: null }, null)).toBe(true);
  });

  it("covers a cutoff the walk has already reached past", () => {
    const archive = { exhausted: false, oldest_seen_at: "2024-01-01T00:00:00Z" };
    expect(archiveCovers(archive, "2025-01-01T00:00:00Z")).toBe(true);
    expect(archiveCovers(archive, "2023-01-01T00:00:00Z")).toBe(false);
  });

  it("never claims to cover 'everything' short of exhaustion", () => {
    // However deep a dated walk went, it cannot prove there is nothing older.
    expect(archiveCovers({ exhausted: false, oldest_seen_at: "2015-01-01T00:00:00Z" }, null)).toBe(
      false
    );
  });

  it("is false with no archive at all", () => {
    expect(archiveCovers(null, "2025-01-01T00:00:00Z")).toBe(false);
  });
});

describe("range helpers", () => {
  it("turns a range into a cutoff, and 'all' into none", () => {
    const now = new Date("2026-08-03T00:00:00Z");
    expect(sinceForRange("12m", now)).toBe("2025-08-03T00:00:00.000Z");
    expect(sinceForRange("6m", now)).toBe("2026-02-03T00:00:00.000Z");
    expect(sinceForRange("all", now)).toBeNull();
  });

  it("merges two asks to the deeper one, with 'everything' winning", () => {
    expect(deeperSince("2025-01-01T00:00:00Z", "2024-01-01T00:00:00Z")).toBe(
      "2024-01-01T00:00:00Z"
    );
    expect(deeperSince("2025-01-01T00:00:00Z", null)).toBeNull();
    expect(deeperSince(null, null)).toBeNull();
  });
});

describe("runArchiveAccount", () => {
  it("saves the cursor and asks to continue when the chunk budget runs out", async () => {
    const { runArchiveAccount } = await loadJob({ ARCHIVE_PAGES_PER_RUN: "3" });
    const callCount = stubGraphPages((call) => ({
      ids: [`r${call}a`, `r${call}b`],
      timestamp: "2026-07-01T00:00:00Z",
      after: `CURSOR${call + 1}`,
    }));
    const db = fakeDb(BASE_TABLES);

    const outcome = await runArchiveAccount(db.client, "acme", { since: null });

    expect(outcome).toBe("continued");
    expect(callCount()).toBe(3);

    const archive = db.store.ig_account_archives[0];
    expect(archive.status).toBe("running");
    expect(archive.cursor).toBe("CURSOR3");
    expect(archive.pages_fetched).toBe(3);
    expect(archive.reels_found).toBe(6);
    expect(archive.exhausted).toBe(false);
  });

  it("resumes from the stored cursor instead of restarting", async () => {
    const { runArchiveAccount } = await loadJob({ ARCHIVE_PAGES_PER_RUN: "1" });
    const seen: string[] = [];
    vi.stubGlobal("fetch", async (url: URL | string) => {
      seen.push(new URL(String(url)).searchParams.get("fields") ?? "");
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          business_discovery: { username: "acme", media: { data: [], paging: {} } },
        }),
        text: async () => "",
      } as unknown as Response;
    });

    const db = fakeDb({
      ...BASE_TABLES,
      ig_account_archives: [
        {
          ig_username: "acme",
          status: "running",
          cursor: "SAVED_CURSOR",
          exhausted: false,
          oldest_seen_at: "2026-06-01T00:00:00Z",
          target_since: null,
          reels_found: 40,
          pages_fetched: 4,
        },
      ],
    });

    await runArchiveAccount(db.client, "acme");

    expect(seen[0]).toContain(".after(SAVED_CURSOR)");
  });

  it("marks the account exhausted when Meta runs out of cursors", async () => {
    const { runArchiveAccount } = await loadJob();
    stubGraphPages([{ ids: ["r1"], timestamp: "2020-01-01T00:00:00Z" }]);
    const db = fakeDb(BASE_TABLES);

    const outcome = await runArchiveAccount(db.client, "acme", { since: null });

    expect(outcome).toBe("completed");
    const archive = db.store.ig_account_archives[0];
    expect(archive.exhausted).toBe(true);
    expect(archive.status).toBe("done");
  });

  it("stops at the date cutoff WITHOUT claiming the account is exhausted", async () => {
    // The distinction is load-bearing: marking a dated stop as exhausted would
    // make a later "everything" request answer itself from cache and return
    // nothing older — permanently, since nothing would ever walk deeper.
    const { runArchiveAccount } = await loadJob({ ARCHIVE_PAGES_PER_RUN: "5" });
    stubGraphPages([
      { ids: ["new1"], timestamp: "2026-07-01T00:00:00Z", after: "C1" },
      { ids: ["old1"], timestamp: "2024-01-01T00:00:00Z", after: "C2" },
    ]);
    const db = fakeDb(BASE_TABLES);

    const outcome = await runArchiveAccount(db.client, "acme", {
      since: "2025-01-01T00:00:00Z",
    });

    expect(outcome).toBe("completed");
    const archive = db.store.ig_account_archives[0];
    expect(archive.status).toBe("done");
    expect(archive.exhausted).toBe(false);
    expect(archive.cursor).toBe("C2"); // a deeper ask can pick up right here
  });

  it("answers from the shared cache without calling Meta when already covered", async () => {
    const { runArchiveAccount } = await loadJob();
    const callCount = stubGraphPages([{ ids: ["r1"], timestamp: "2026-01-01T00:00:00Z" }]);
    const db = fakeDb({
      ...BASE_TABLES,
      ig_account_archives: [
        {
          ig_username: "acme",
          status: "done",
          cursor: null,
          exhausted: true,
          oldest_seen_at: "2019-01-01T00:00:00Z",
          target_since: null,
          reels_found: 812,
          pages_fetched: 40,
        },
      ],
    });

    const outcome = await runArchiveAccount(db.client, "acme", { since: null });

    expect(outcome).toBe("completed");
    expect(callCount()).toBe(0);
  });

  it("does not overwrite a self-hosted thumbnail with an expiring Instagram URL", async () => {
    const { runArchiveAccount } = await loadJob();
    const cached =
      "https://project.supabase.co/storage/v1/object/public/ig-media/thumbnails/r1.jpg";
    stubGraphPages([{ ids: ["r1"], timestamp: "2026-01-01T00:00:00Z" }]);

    const db = fakeDb({
      ...BASE_TABLES,
      ig_reel_snapshots: [
        { ig_username: "acme", ig_media_id: "r1", thumbnail_url: cached, permalink: "p" },
      ],
    });

    await runArchiveAccount(db.client, "acme", { since: null });

    const reel = db.store.ig_reel_snapshots.find((r) => r.ig_media_id === "r1");
    // A dead signed URL can't be retried back to life, so replacing a permanent
    // copy with an expiring one would break an image that currently works.
    expect(reel?.thumbnail_url).toBe(cached);
  });

  it("counts only newly discovered reels, not re-walked ones", async () => {
    const { runArchiveAccount } = await loadJob();
    stubGraphPages([{ ids: ["r1", "r2"], timestamp: "2026-01-01T00:00:00Z" }]);
    const db = fakeDb({
      ...BASE_TABLES,
      ig_reel_snapshots: [{ ig_username: "acme", ig_media_id: "r1", thumbnail_url: null }],
    });

    await runArchiveAccount(db.client, "acme", { since: null });

    expect(db.store.ig_account_archives[0].reels_found).toBe(1);
  });

  it("keeps its progress and reports a throttle rather than failing", async () => {
    const { runArchiveAccount } = await loadJob({ ARCHIVE_PAGES_PER_RUN: "4" });
    let call = 0;
    vi.stubGlobal("fetch", async () => {
      call += 1;
      if (call === 1) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            business_discovery: {
              username: "acme",
              media: {
                data: [
                  {
                    id: "r1",
                    media_type: "VIDEO",
                    permalink: "p",
                    timestamp: "2026-07-01T00:00:00Z",
                  },
                ],
                paging: { cursors: { after: "C1" } },
              },
            },
          }),
          text: async () => "",
        } as unknown as Response;
      }
      // Meta's own throttle signal (error code 4).
      return {
        ok: false,
        status: 400,
        headers: new Headers(),
        json: async () => ({}),
        text: async () => '{"error":{"message":"(#4) Application request limit reached"}}',
      } as unknown as Response;
    });

    const db = fakeDb(BASE_TABLES);

    const outcome = await runArchiveAccount(db.client, "acme", { since: null });

    expect(outcome).toBe("throttled");
    const archive = db.store.ig_account_archives[0];
    // The page already walked is banked, so resuming costs nothing extra.
    expect(archive.cursor).toBe("C1");
    expect(archive.reels_found).toBe(1);
    expect(archive.status).toBe("running");
  });

  it("reports no_token when nobody has a healthy Instagram connection", async () => {
    const { runArchiveAccount } = await loadJob();
    stubGraphPages([{ ids: ["r1"], timestamp: "2026-01-01T00:00:00Z" }]);
    const db = fakeDb({ ...BASE_TABLES, profiles: [] });

    expect(await runArchiveAccount(db.client, "acme", { since: null })).toBe("no_token");
  });

  it("skips an empty username instead of walking a nonsense account", async () => {
    const { runArchiveAccount } = await loadJob();
    const db = fakeDb(BASE_TABLES);
    expect(await runArchiveAccount(db.client, "  ", { since: null })).toBe("skipped");
  });

  it("refuses to walk when its own progress table is unreachable", async () => {
    // The production incident: ig_account_archives was never migrated, the read
    // error was taken for "no archive yet", and every pass restarted from page 1
    // — re-fetching the same history hourly, out of a shared Meta budget, while
    // reporting success. Failing loudly is what makes that a one-run bug.
    const { runArchiveAccount } = await loadJob();
    const callCount = stubGraphPages([{ ids: ["r1"], timestamp: "2026-01-01T00:00:00Z" }]);
    const db = fakeDb(BASE_TABLES, ["ig_account_archives"]);

    await expect(runArchiveAccount(db.client, "acme", { since: null })).rejects.toThrow(
      /archive state unreadable/i
    );
    // And it gave up BEFORE spending anything on Meta.
    expect(callCount()).toBe(0);
  });

  it("stops instead of re-enqueueing when the cursor stops advancing", async () => {
    // Meta handing back the position we already had means the next pass would
    // fetch byte-identical pages. Continuing turns one archive into an unbounded
    // hourly drain on the budget every customer shares.
    const { runArchiveAccount } = await loadJob({ ARCHIVE_PAGES_PER_RUN: "3" });
    stubGraphPages([{ ids: ["r1"], timestamp: "2026-07-01T00:00:00Z", after: "STUCK" }]);
    const db = fakeDb({
      ...BASE_TABLES,
      ig_account_archives: [
        {
          ig_username: "acme",
          status: "running",
          cursor: "STUCK",
          exhausted: false,
          oldest_seen_at: "2026-07-01T00:00:00Z",
          target_since: null,
          reels_found: 5,
          pages_fetched: 3,
        },
      ],
    });

    const outcome = await runArchiveAccount(db.client, "acme", { since: null });

    // `completed` is what stops the worker re-enqueueing; `partial` is the row
    // staying honest that the history is not actually finished.
    expect(outcome).toBe("completed");
    expect(db.store.ig_account_archives[0].status).toBe("partial");
    expect(db.store.ig_account_archives[0].exhausted).toBe(false);
  });

  it("delivers each chunk to the feed instead of holding it until the walk ends", async () => {
    // A deep archive is many chunks over many hours. Fanning out only at the end
    // means the user is told "fetching in background" and then watches a feed
    // that never changes — the reels are already cached and cost nothing to hand
    // over, so every chunk should land.
    const { runArchiveAccount } = await loadJob({ ARCHIVE_PAGES_PER_RUN: "2" });
    stubGraphPages((call) => ({
      ids: [`r${call}`],
      timestamp: "2026-07-01T00:00:00Z",
      after: `C${call + 1}`,
    }));
    const db = fakeDb({
      ...BASE_TABLES,
      inspiration_accounts: [{ id: "acct-1", user_id: "user-1", ig_username: "acme" }],
      ig_account_archive_requests: [{ ig_username: "acme", user_id: "user-1", since: null }],
      tracked_reels: [],
    });

    const outcome = await runArchiveAccount(db.client, "acme", { since: null });

    expect(outcome).toBe("continued");
    // Mid-walk, and the reels this chunk recovered are already in the feed.
    expect(db.store.tracked_reels.length).toBeGreaterThan(0);
    expect(db.store.ig_account_archive_requests[0].materialized_at).toBeTruthy();
  });
});
