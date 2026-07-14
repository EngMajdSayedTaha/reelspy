import { describe, it, expect, vi, beforeEach } from "vitest";

// Mutable fixtures the mocked supabase client reads from.
let getUserResult: { data: { user: unknown }; error?: unknown };
let profileRow: { data: unknown; error: unknown };
let getUserThrows = false;

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

import { requireAdmin } from "@/lib/admin/auth";

function req(headers: Record<string, string> = {}): Request {
  return new Request("https://x/api/admin/x", { headers });
}

beforeEach(() => {
  getUserResult = { data: { user: null } };
  profileRow = { data: { is_admin: false }, error: null };
  getUserThrows = false;
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

  it("passes an admin and populates ctx (user, clients, ip, ua)", async () => {
    getUserResult = { data: { user: { id: "admin-1" } } };
    profileRow = { data: { is_admin: true }, error: null };
    const gate = await requireAdmin(req({ "x-forwarded-for": "9.9.9.9, 1.1.1.1", "user-agent": "curl" }));
    expect(gate.ok).toBe(true);
    if (gate.ok) {
      expect(gate.ctx.user.id).toBe("admin-1");
      expect(gate.ctx.admin).toBeTruthy();
      expect(gate.ctx.supabase).toBeTruthy();
      expect(gate.ctx.ip).toBe("9.9.9.9");
      expect(gate.ctx.userAgent).toBe("curl");
    }
  });
});
