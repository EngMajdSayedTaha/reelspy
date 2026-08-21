import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

import {
  isReauthFresh,
  listElevations,
  touchElevation,
  verifyElevation,
  type ElevationSession,
} from "@/lib/admin/elevation";
import { sha256Hex } from "@/lib/admin/token";

// A live elevation is the ONLY thing standing between "has an admin login" and
// "is operating the panel right now", so every way one can be dead — expired,
// idled out, revoked, belonging to someone else, unreadable — is pinned here.
// All of them must fail closed.

type Row = Record<string, unknown>;

// Minimal stand-in for the two query shapes this module uses:
//   from(t).select(cols).eq(...).maybeSingle()
//   from(t).select(cols).eq(...).is(...).gt(...).order(...).limit(...)
//   from(t).update(patch).eq(...)
function fakeClient(rows: Row[]) {
  const updates: { patch: Row; filters: Row }[] = [];

  const builder = () => {
    const filters: Row = {};
    const chain: Record<string, unknown> = {};
    let patch: Row | null = null;

    const api = {
      select: () => api,
      eq: (column: string, value: unknown) => {
        filters[column] = value;
        return api;
      },
      is: (column: string, value: unknown) => {
        filters[`is:${column}`] = value;
        return api;
      },
      gt: (column: string, value: unknown) => {
        filters[`gt:${column}`] = value;
        return api;
      },
      order: () => api,
      limit: () => Promise.resolve({ data: matching(), error: null }),
      update: (values: Row) => {
        patch = values;
        return {
          eq: (column: string, value: unknown) => {
            filters[column] = value;
            updates.push({ patch: patch!, filters });
            return Promise.resolve({ error: null });
          },
        };
      },
      maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
      then: undefined,
    };

    function matching(): Row[] {
      return rows.filter((row) =>
        Object.entries(filters).every(([key, value]) => {
          if (key.startsWith("is:")) return row[key.slice(3)] === value;
          if (key.startsWith("gt:")) return String(row[key.slice(3)]) > String(value);
          return row[key] === value;
        })
      );
    }

    return Object.assign(chain, api);
  };

  return {
    client: { from: () => builder() } as unknown as SupabaseClient,
    updates,
  };
}

const TOKEN = "opaque-token";
const NOW = new Date("2026-08-21T12:00:00.000Z");

function row(overrides: Row = {}): Row {
  return {
    id: "session-1",
    admin_id: "admin-1",
    token_hash: sha256Hex(TOKEN),
    created_at: "2026-08-21T11:00:00.000Z",
    reauth_at: "2026-08-21T11:55:00.000Z",
    last_seen_at: "2026-08-21T11:59:00.000Z",
    expires_at: "2026-08-21T19:00:00.000Z",
    revoked_at: null,
    ip: "203.0.113.7",
    user_agent: "Mozilla/5.0",
    ...overrides,
  };
}

describe("verifyElevation", () => {
  it("accepts a live elevation for the right admin", async () => {
    const { client } = fakeClient([row()]);
    const check = await verifyElevation(client, "admin-1", TOKEN, NOW);
    expect(check.status).toBe("ok");
    if (check.status === "ok") expect(check.session.id).toBe("session-1");
  });

  it("reports 'none' when there is no cookie at all", async () => {
    const { client } = fakeClient([row()]);
    expect((await verifyElevation(client, "admin-1", null, NOW)).status).toBe("none");
  });

  it("never matches on the raw token — only its digest is stored", async () => {
    // The row holds sha256(token); a database leak must not be replayable.
    const { client } = fakeClient([row({ token_hash: TOKEN })]);
    expect((await verifyElevation(client, "admin-1", TOKEN, NOW)).status).toBe("expired");
  });

  it("rejects an unknown token", async () => {
    const { client } = fakeClient([row()]);
    expect((await verifyElevation(client, "admin-1", "other-token", NOW)).status).toBe("expired");
  });

  it("rejects a revoked elevation", async () => {
    const { client } = fakeClient([row({ revoked_at: "2026-08-21T11:30:00.000Z" })]);
    expect((await verifyElevation(client, "admin-1", TOKEN, NOW)).status).toBe("expired");
  });

  it("rejects one past its absolute deadline", async () => {
    const { client } = fakeClient([row({ expires_at: "2026-08-21T11:59:00.000Z" })]);
    expect((await verifyElevation(client, "admin-1", TOKEN, NOW)).status).toBe("expired");
  });

  it("rejects one that idled out, even though it hasn't expired", async () => {
    // Last seen 45 min ago against a 30 min idle window: the tab was left open
    // and walked away from, which is the case idle timeouts exist for.
    const { client } = fakeClient([row({ last_seen_at: "2026-08-21T11:15:00.000Z" })]);
    expect((await verifyElevation(client, "admin-1", TOKEN, NOW)).status).toBe("expired");
  });

  it("rejects another admin's elevation on the same browser", async () => {
    const { client } = fakeClient([row()]);
    expect((await verifyElevation(client, "admin-2", TOKEN, NOW)).status).toBe("foreign");
  });
});

describe("isReauthFresh", () => {
  const session = (reauthAt: string): ElevationSession => ({
    id: "s",
    adminId: "admin-1",
    createdAt: reauthAt,
    reauthAt,
    lastSeenAt: reauthAt,
    expiresAt: "2026-08-21T19:00:00.000Z",
    ip: null,
    userAgent: null,
  });

  it("is fresh inside the re-auth window", () => {
    expect(isReauthFresh(session("2026-08-21T11:55:00.000Z"), NOW)).toBe(true);
  });

  it("goes stale outside it, even though the elevation is still valid", () => {
    expect(isReauthFresh(session("2026-08-21T11:30:00.000Z"), NOW)).toBe(false);
  });
});

describe("touchElevation", () => {
  let session: ElevationSession;
  beforeEach(() => {
    session = {
      id: "session-1",
      adminId: "admin-1",
      createdAt: "2026-08-21T11:00:00.000Z",
      reauthAt: "2026-08-21T11:55:00.000Z",
      lastSeenAt: "2026-08-21T11:59:30.000Z",
      expiresAt: "2026-08-21T19:00:00.000Z",
      ip: null,
      userAgent: null,
    };
  });

  it("skips the write when the heartbeat is under a minute old", async () => {
    const { client, updates } = fakeClient([row()]);
    await touchElevation(client, session, NOW);
    expect(updates).toHaveLength(0);
  });

  it("writes once the heartbeat is stale", async () => {
    const { client, updates } = fakeClient([row()]);
    await touchElevation(client, { ...session, lastSeenAt: "2026-08-21T11:50:00.000Z" }, NOW);
    expect(updates).toHaveLength(1);
    expect(updates[0]!.patch.last_seen_at).toBe(NOW.toISOString());
  });
});

describe("listElevations", () => {
  it("hides idled-out rows and marks the caller's own device", async () => {
    const { client } = fakeClient([
      row(),
      row({ id: "session-2", last_seen_at: "2026-08-21T10:00:00.000Z" }),
    ]);
    const sessions = await listElevations(client, "admin-1", "session-1", NOW);
    expect(sessions.map((s) => s.id)).toEqual(["session-1"]);
    expect(sessions[0]!.current).toBe(true);
  });
});
