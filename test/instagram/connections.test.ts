import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getActiveIgCredentials,
  listIgConnections,
  setActiveIgConnection,
} from "@/lib/instagram/connections";
import { limitFor } from "@/lib/billing/entitlements";

// Per-table canned result. Every builder method chains; maybeSingle and the
// thenable terminal resolve the table's { data, error }.
function fakeAdmin(byTable: Record<string, { data: unknown; error?: unknown }>): SupabaseClient {
  const make = (table: string) => {
    const res = byTable[table] ?? { data: null, error: null };
    const settled = { data: res.data, error: res.error ?? null };
    const b: Record<string, unknown> = {
      select: () => b,
      eq: () => b,
      order: () => b,
      update: () => b,
      delete: () => b,
      returns: () => b,
      maybeSingle: async () => settled,
      then: (resolve: (v: unknown) => unknown) => resolve(settled),
    };
    return b;
  };
  return { from: (t: string) => make(t) } as unknown as SupabaseClient;
}

describe("entitlements: ig_connections (X4 gate)", () => {
  it("only Studio is multi-account", () => {
    expect(limitFor("free", "ig_connections")).toBe(1);
    expect(limitFor("creator", "ig_connections")).toBe(1);
    expect(limitFor("pro", "ig_connections")).toBe(1);
    expect(limitFor("studio", "ig_connections")).toBe(5);
  });
});

describe("getActiveIgCredentials (fail-open)", () => {
  it("returns the active connection's credentials", async () => {
    const admin = fakeAdmin({
      profiles: { data: { active_ig_connection_id: "c1" } },
      ig_connections: {
        data: {
          ig_user_id: "ig1",
          access_token: "tok",
          token_status: "active",
          token_expires_at: null,
        },
      },
    });
    expect(await getActiveIgCredentials(admin, "u1")).toEqual({
      igUserId: "ig1",
      token: "tok",
      status: "active",
      expiresAt: null,
    });
  });

  it("returns null when there's no active pointer (fall back to profiles)", async () => {
    const admin = fakeAdmin({ profiles: { data: { active_ig_connection_id: null } } });
    expect(await getActiveIgCredentials(admin, "u1")).toBeNull();
  });

  it("returns null when the profiles read errors (missing column pre-migration)", async () => {
    const admin = fakeAdmin({ profiles: { data: null, error: { message: "no column" } } });
    expect(await getActiveIgCredentials(admin, "u1")).toBeNull();
  });

  it("returns null when the active connection has no token", async () => {
    const admin = fakeAdmin({
      profiles: { data: { active_ig_connection_id: "c1" } },
      ig_connections: { data: { ig_user_id: "ig1", access_token: null } },
    });
    expect(await getActiveIgCredentials(admin, "u1")).toBeNull();
  });
});

describe("listIgConnections", () => {
  it("maps rows to summaries", async () => {
    const admin = fakeAdmin({
      ig_connections: {
        data: [
          {
            id: "c1",
            ig_user_id: "ig1",
            username: "acme",
            display_name: "Acme",
            avatar_url: "a",
            token_status: "active",
            is_active: true,
          },
        ],
      },
    });
    const list = await listIgConnections(admin, "u1");
    expect(list).toEqual([
      {
        id: "c1",
        igUserId: "ig1",
        username: "acme",
        displayName: "Acme",
        avatarUrl: "a",
        tokenStatus: "active",
        isActive: true,
      },
    ]);
  });

  it("returns [] on error (missing table pre-migration)", async () => {
    const admin = fakeAdmin({ ig_connections: { data: null, error: { message: "no table" } } });
    expect(await listIgConnections(admin, "u1")).toEqual([]);
  });
});

describe("setActiveIgConnection (owner check)", () => {
  it("returns false when the connection isn't the user's", async () => {
    const admin = fakeAdmin({ ig_connections: { data: null } });
    expect(await setActiveIgConnection(admin, "u1", "c1")).toBe(false);
  });

  it("returns true when the owned connection is activated", async () => {
    const admin = fakeAdmin({
      ig_connections: { data: { id: "c1" } },
      profiles: { data: null, error: null },
    });
    expect(await setActiveIgConnection(admin, "u1", "c1")).toBe(true);
  });
});
