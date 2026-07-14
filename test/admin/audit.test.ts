import { describe, it, expect, vi } from "vitest";
import { writeAudit } from "@/lib/admin/audit";
import { fakeAdminSupabase, makeRecorder } from "../helpers/fake-supabase";

describe("writeAudit", () => {
  it("inserts a well-shaped row", async () => {
    const rec = makeRecorder();
    const admin = fakeAdminSupabase({ insert: { data: null, error: null }, recorder: rec });
    await writeAudit(admin, {
      adminId: "admin-1",
      action: "user.ban",
      targetType: "user",
      targetId: "user-9",
      payload: { banned: true },
      ip: "1.2.3.4",
      userAgent: "jest",
    });
    expect(rec.lastTable).toBe("admin_audit_log");
    expect(rec.inserted[0]).toMatchObject({
      admin_id: "admin-1",
      action: "user.ban",
      target_type: "user",
      target_id: "user-9",
      payload: { banned: true },
      ip: "1.2.3.4",
      user_agent: "jest",
    });
  });

  it("defaults optional fields (payload {}, null ip/ua/target)", async () => {
    const rec = makeRecorder();
    const admin = fakeAdminSupabase({ recorder: rec });
    await writeAudit(admin, { adminId: "a", action: "x", targetType: "y" });
    expect(rec.inserted[0]).toMatchObject({ payload: {}, ip: null, user_agent: null, target_id: null });
  });

  it("swallows an insert error (never throws)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const admin = fakeAdminSupabase({ insert: { data: null, error: { message: "boom" } } });
    await expect(
      writeAudit(admin, { adminId: "a", action: "x", targetType: "y" })
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
