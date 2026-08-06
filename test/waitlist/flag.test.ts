import { describe, it, expect } from "vitest";
import {
  WAITLIST_FLAG_DEFAULT,
  WAITLIST_FLAG_KEY,
  normalizeWaitlistFlag,
  nextWaitlistFlag,
  readWaitlistFlag,
} from "@/lib/waitlist/flag";
import { memoryDb } from "@/test/helpers/memory-table";
import { throwingSupabase } from "@/test/helpers/fake-supabase";

describe("normalizeWaitlistFlag", () => {
  it("treats an absent row as OFF", () => {
    expect(normalizeWaitlistFlag(undefined)).toEqual(WAITLIST_FLAG_DEFAULT);
    expect(normalizeWaitlistFlag(null).enabled).toBe(false);
    expect(normalizeWaitlistFlag({}).enabled).toBe(false);
  });

  it("only accepts a literal true for the switch", () => {
    // The row is a free-form jsonb an admin can hand-edit through the generic
    // settings panel, so "true"/1/"yes" must NOT close the product.
    expect(normalizeWaitlistFlag({ enabled: "true" }).enabled).toBe(false);
    expect(normalizeWaitlistFlag({ enabled: 1 }).enabled).toBe(false);
    expect(normalizeWaitlistFlag({ enabled: true }).enabled).toBe(true);
  });

  it("defaults sendEmails to ON but autoApprove to OFF", () => {
    const f = normalizeWaitlistFlag({ enabled: true });
    expect(f.sendEmails).toBe(true);
    expect(f.autoApprove).toBe(false);
    expect(normalizeWaitlistFlag({ sendEmails: false }).sendEmails).toBe(false);
  });

  it("drops an unparseable enabledSince rather than carrying it forward", () => {
    expect(normalizeWaitlistFlag({ enabledSince: "not a date" }).enabledSince).toBeNull();
    expect(normalizeWaitlistFlag({ enabledSince: "" }).enabledSince).toBeNull();
    expect(normalizeWaitlistFlag({ enabledSince: "2026-08-06T00:00:00Z" }).enabledSince).toBe(
      "2026-08-06T00:00:00Z"
    );
  });
});

describe("nextWaitlistFlag — the grandfather stamp", () => {
  const T1 = "2026-08-01T00:00:00.000Z";
  const T2 = "2026-09-01T00:00:00.000Z";

  it("stamps enabledSince on an OFF→ON transition", () => {
    const next = nextWaitlistFlag(WAITLIST_FLAG_DEFAULT, { enabled: true }, T1);
    expect(next.enabledSince).toBe(T1);
  });

  it("does NOT move the cutoff when re-saving an already-on flag", () => {
    // Otherwise every unrelated settings save (toggling emails, say) would
    // push the cutoff forward and strand everyone who joined since.
    const on = nextWaitlistFlag(WAITLIST_FLAG_DEFAULT, { enabled: true }, T1);
    const resaved = nextWaitlistFlag(on, { sendEmails: false }, T2);
    expect(resaved.enabledSince).toBe(T1);
    expect(resaved.enabled).toBe(true);
  });

  it("re-stamps on a second OFF→ON so an open window grandfathers its joiners", () => {
    const on = nextWaitlistFlag(WAITLIST_FLAG_DEFAULT, { enabled: true }, T1);
    const off = nextWaitlistFlag(on, { enabled: false }, T1);
    const onAgain = nextWaitlistFlag(off, { enabled: true }, T2);
    expect(onAgain.enabledSince).toBe(T2);
  });
});

describe("readWaitlistFlag", () => {
  it("reads the app_settings row", async () => {
    const db = memoryDb({
      app_settings: [{ key: WAITLIST_FLAG_KEY, value: { enabled: true, autoApprove: true } }],
    });
    const flag = await readWaitlistFlag(db.client);
    expect(flag.enabled).toBe(true);
    expect(flag.autoApprove).toBe(true);
  });

  it("resolves to OFF when the row is missing", async () => {
    const db = memoryDb({ app_settings: [] });
    expect((await readWaitlistFlag(db.client)).enabled).toBe(false);
  });

  it("resolves to OFF — never ON — when the read throws", async () => {
    // Guessing ON during a DB blip would lock every paying customer out.
    expect((await readWaitlistFlag(throwingSupabase())).enabled).toBe(false);
  });
});
