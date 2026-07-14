import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeAdminSupabase, makeRecorder, type FakeRecorder } from "../helpers/fake-supabase";

// Configurable gate result the mocked requireAdmin returns.
let ctx: {
  user: { id: string };
  supabase: unknown;
  admin: unknown;
  ip: string | null;
  userAgent: string | null;
};

vi.mock("@/lib/admin/auth", async () => {
  const { NextResponse } = await import("next/server");
  return {
    requireAdmin: async () => ({ ok: true, ctx }),
    adminNotFound: () => NextResponse.json({ error: "Not found" }, { status: 404 }),
  };
});

const auditSpy = vi.fn();
vi.mock("@/lib/admin/audit", () => ({ writeAudit: (...args: unknown[]) => auditSpy(...args) }));

import { POST as adminFlagPost } from "@/app/api/admin/users/[id]/admin-flag/route";
import { POST as banPost } from "@/app/api/admin/users/[id]/ban/route";
import { DELETE as userDelete } from "@/app/api/admin/users/[id]/route";
import { POST as tierPost } from "@/app/api/admin/users/[id]/tier/route";

const ADMIN_ID = "admin-1";

// A ctx whose RLS client always allows the mutation rate-limit RPC.
function makeCtx(admin: unknown) {
  return {
    user: { id: ADMIN_ID },
    supabase: { rpc: async () => ({ data: [{ allowed: true }], error: null }) },
    admin,
    ip: null,
    userAgent: null,
  };
}

function post(body: unknown): Request {
  return new Request("https://x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  auditSpy.mockClear();
});

describe("admin user route foot-gun guards", () => {
  it("rejects an admin removing their own admin flag", async () => {
    ctx = makeCtx(fakeAdminSupabase({}));
    const res = await adminFlagPost(post({ is_admin: false }), params(ADMIN_ID));
    expect(res.status).toBe(400);
    expect(auditSpy).not.toHaveBeenCalled();
  });

  it("rejects an admin banning themselves", async () => {
    ctx = makeCtx(fakeAdminSupabase({}));
    const res = await banPost(post({ banned: true }), params(ADMIN_ID));
    expect(res.status).toBe(400);
  });

  it("rejects an admin deleting themselves", async () => {
    ctx = makeCtx(fakeAdminSupabase({}));
    const res = await userDelete(
      new Request("https://x", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "whatever" }),
      }),
      params(ADMIN_ID)
    );
    expect(res.status).toBe(400);
  });

  it("rejects tier=custom without valid entitlements", async () => {
    ctx = makeCtx(fakeAdminSupabase({}));
    const res = await tierPost(post({ tier: "custom" }), params("user-9"));
    expect(res.status).toBe(400);
  });

  it("grants admin to another user and writes an audit entry", async () => {
    const rec: FakeRecorder = makeRecorder();
    // before-row read returns is_admin:false; update succeeds.
    ctx = makeCtx(
      fakeAdminSupabase({ maybeSingle: { data: { is_admin: false }, error: null }, recorder: rec })
    );
    const res = await adminFlagPost(post({ is_admin: true }), params("user-9"));
    expect(res.status).toBe(200);
    expect(rec.updated[0]).toMatchObject({ is_admin: true });
    expect(auditSpy).toHaveBeenCalledTimes(1);
    expect(auditSpy.mock.calls[0][1]).toMatchObject({
      action: "user.admin_flag",
      targetType: "user",
      targetId: "user-9",
    });
  });

  it("applies a fixed-tier override with an active, Stripe-detached row + audit", async () => {
    const rec: FakeRecorder = makeRecorder();
    ctx = makeCtx(fakeAdminSupabase({ maybeSingle: { data: null, error: null }, recorder: rec }));
    const res = await tierPost(post({ tier: "pro" }), params("user-9"));
    expect(res.status).toBe(200);
    expect(rec.inserted[0]).toMatchObject({
      user_id: "user-9",
      tier: "pro",
      status: "active",
      stripe_customer_id: null,
      stripe_subscription_id: null,
    });
    expect(auditSpy).toHaveBeenCalledTimes(1);
  });
});
