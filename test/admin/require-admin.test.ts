import { describe, it, expect, vi, beforeEach } from "vitest";

// Mutable fixtures the mocked supabase client reads from.
let getUserResult: { data: { user: unknown }; error?: unknown };
let profileRow: { data: unknown; error: unknown };
let getUserThrows = false;
// Step-up fixtures: what the elevation cookie is, and what it resolves to.
let elevationToken: string | null = "token";
let elevationCheck: unknown;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      maybeSingle: async () => profileRow,
    };
    return {
      auth: {
        getUser: async () => {
          if (getUserThrows) throw new Error("auth down");
          return getUserResult;
        },
      },
      from: () => builder,
    };
  },
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ __service_role: true }),
}));

// The elevation store is exercised on its own in elevation.test.ts; here we
// only care that the gate consults it and reacts correctly.
vi.mock("@/lib/admin/elevation", () => ({
  readElevationToken: async () => elevationToken,
  verifyElevation: async () => elevationCheck,
  touchElevation: async () => {},
  isReauthFresh: (session: { reauthAt: string }) =>
    new Date(session.reauthAt).getTime() + 10 * 60_000 > Date.now(),
}));

import { requireAdmin, requireAdminIdentity } from "@/lib/admin/auth";

function req(headers: Record<string, string> = {}, init: RequestInit = {}): Request {
  return new Request("https://app.reelspy.dev/api/admin/x", { headers, ...init });
}

function liveElevation(reauthMinutesAgo = 0) {
  return {
    status: "ok",
    session: {
      id: "session-1",
      adminId: "admin-1",
      createdAt: new Date().toISOString(),
      reauthAt: new Date(Date.now() - reauthMinutesAgo * 60_000).toISOString(),
      lastSeenAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      ip: null,
      userAgent: null,
    },
  };
}

beforeEach(() => {
  getUserResult = { data: { user: null } };
  profileRow = { data: { is_admin: false }, error: null };
  getUserThrows = false;
  elevationToken = "token";
  elevationCheck = liveElevation();
});

describe("requireAdmin", () => {
  it("404s when there is no session (fails closed)", async () => {
    getUserResult = { data: { user: null } };
    const gate = await requireAdmin(req());
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.response.status).toBe(404);
  });

  it("404s a signed-in non-admin", async () => {
    getUserResult = { data: { user: { id: "u1" } } };
    profileRow = { data: { is_admin: false }, error: null };
    const gate = await requireAdmin(req());
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.response.status).toBe(404);
  });

  it("404s when the profile read errors (fails closed)", async () => {
    getUserResult = { data: { user: { id: "u1" } } };
    profileRow = { data: null, error: { message: "db down" } };
    const gate = await requireAdmin(req());
    expect(gate.ok).toBe(false);
  });

  it("404s when getUser throws", async () => {
    getUserThrows = true;
    const gate = await requireAdmin(req());
    expect(gate.ok).toBe(false);
  });

  it("passes an admin and populates ctx (user, clients, elevation, ip, ua)", async () => {
    getUserResult = { data: { user: { id: "admin-1" } } };
    profileRow = { data: { is_admin: true }, error: null };
    const gate = await requireAdmin(req({ "x-forwarded-for": "9.9.9.9, 1.1.1.1", "user-agent": "curl" }));
    expect(gate.ok).toBe(true);
    if (gate.ok) {
      expect(gate.ctx.user.id).toBe("admin-1");
      expect(gate.ctx.admin).toBeTruthy();
      expect(gate.ctx.supabase).toBeTruthy();
      expect(gate.ctx.elevation.id).toBe("session-1");
      expect(gate.ctx.ip).toBe("9.9.9.9");
      expect(gate.ctx.userAgent).toBe("curl");
    }
  });
});

// `is_admin` alone used to be the whole gate. These are the cases that proves
// it no longer is: an attacker holding a valid founder session, and nothing else.
describe("requireAdmin — step-up elevation", () => {
  beforeEach(() => {
    getUserResult = { data: { user: { id: "admin-1" } } };
    profileRow = { data: { is_admin: true }, error: null };
  });

  it("403s an admin who never unlocked the panel", async () => {
    elevationToken = null;
    elevationCheck = { status: "none" };
    const gate = await requireAdmin(req());
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.response.status).toBe(403);
      expect((await gate.response.json()).code).toBe("elevation_required");
    }
  });

  it("403s an expired, idled-out or revoked elevation", async () => {
    elevationCheck = { status: "expired" };
    const gate = await requireAdmin(req());
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.response.status).toBe(403);
  });

  it("403s an elevation belonging to a different admin", async () => {
    elevationCheck = { status: "foreign" };
    const gate = await requireAdmin(req());
    expect(gate.ok).toBe(false);
  });

  it("fails closed when the elevation lookup throws", async () => {
    elevationCheck = undefined;
    const gate = await requireAdmin(
      new Request("https://app.reelspy.dev/api/admin/x", { headers: {} })
    );
    // `undefined.status` throws inside the gate; the catch must deny, not pass.
    expect(gate.ok).toBe(false);
  });
});

describe("requireAdmin — fresh re-auth for critical actions", () => {
  beforeEach(() => {
    getUserResult = { data: { user: { id: "admin-1" } } };
    profileRow = { data: { is_admin: true }, error: null };
  });

  const criticalRequest = () =>
    new Request("https://app.reelspy.dev/api/admin/users/abc/admin-flag", { method: "POST" });

  it("lets a critical action through on a freshly-entered passphrase", async () => {
    elevationCheck = liveElevation(1);
    const gate = await requireAdmin(criticalRequest());
    expect(gate.ok).toBe(true);
  });

  it("asks again when the passphrase is hours old", async () => {
    elevationCheck = liveElevation(60);
    const gate = await requireAdmin(criticalRequest());
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.response.status).toBe(403);
      const body = await gate.response.json();
      expect(body.code).toBe("reauth_required");
      expect(body.action).toBe("change who has admin access");
    }
  });

  it("does not ask again for an ordinary action on the same stale elevation", async () => {
    elevationCheck = liveElevation(60);
    const gate = await requireAdmin(
      new Request("https://app.reelspy.dev/api/admin/users/abc/notes", { method: "POST" })
    );
    expect(gate.ok).toBe(true);
  });
});

describe("requireAdminIdentity — same-origin", () => {
  beforeEach(() => {
    getUserResult = { data: { user: { id: "admin-1" } } };
    profileRow = { data: { is_admin: true }, error: null };
  });

  it("allows a same-origin mutation", async () => {
    const gate = await requireAdminIdentity(
      new Request("https://app.reelspy.dev/api/admin/x", {
        method: "POST",
        headers: { origin: "https://app.reelspy.dev" },
      })
    );
    expect(gate.ok).toBe(true);
  });

  it("allows a mutation with no Origin header at all (curl, scripts)", async () => {
    const gate = await requireAdminIdentity(
      new Request("https://app.reelspy.dev/api/admin/x", { method: "POST" })
    );
    expect(gate.ok).toBe(true);
  });

  it("404s a cross-origin mutation", async () => {
    const gate = await requireAdminIdentity(
      new Request("https://app.reelspy.dev/api/admin/x", {
        method: "POST",
        headers: { origin: "https://evil.example" },
      })
    );
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.response.status).toBe(404);
  });

  it("ignores Origin on a read", async () => {
    const gate = await requireAdminIdentity(
      new Request("https://app.reelspy.dev/api/admin/x", {
        headers: { origin: "https://evil.example" },
      })
    );
    expect(gate.ok).toBe(true);
  });
});
