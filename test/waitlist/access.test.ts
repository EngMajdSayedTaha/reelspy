import { describe, it, expect } from "vitest";
import { resolveWaitlistGate } from "@/lib/waitlist/access";
import { normalizeWaitlistFlag, type WaitlistFlag } from "@/lib/waitlist/flag";
import { memoryDb } from "@/test/helpers/memory-table";
import { throwingSupabase } from "@/test/helpers/fake-supabase";

const SWITCH_ON_AT = "2026-08-06T00:00:00.000Z";
const BEFORE = "2026-07-01T00:00:00.000Z";
const AFTER = "2026-09-01T00:00:00.000Z";

const ON: WaitlistFlag = normalizeWaitlistFlag({
  enabled: true,
  enabledSince: SWITCH_ON_AT,
});
const OFF: WaitlistFlag = normalizeWaitlistFlag({ enabled: false });

const subject = (over: Partial<Parameters<typeof resolveWaitlistGate>[1]> = {}) => ({
  userId: "user-1",
  email: "a@example.com",
  accountCreatedAt: AFTER,
  isAdmin: false,
  ...over,
});

describe("resolveWaitlistGate", () => {
  it("lets everyone through when the switch is off", async () => {
    const db = memoryDb({ waitlist_entries: [] });
    const gate = await resolveWaitlistGate(db.client, subject(), OFF);
    expect(gate.held).toBe(false);
    // And it does no work at all — no entry is created for a normal signup.
    expect(db.tables.waitlist_entries).toHaveLength(0);
  });

  it("never holds an admin", async () => {
    const db = memoryDb({ waitlist_entries: [] });
    const gate = await resolveWaitlistGate(db.client, subject({ isAdmin: true }), ON);
    expect(gate.held).toBe(false);
  });

  it("grandfathers accounts that existed when the switch was flipped", async () => {
    // The one thing this feature must never do is lock out a paying customer.
    const db = memoryDb({ waitlist_entries: [] });
    const gate = await resolveWaitlistGate(db.client, subject({ accountCreatedAt: BEFORE }), ON);
    expect(gate.held).toBe(false);
  });

  it("holds a brand-new account and puts it in the queue", async () => {
    const db = memoryDb({ waitlist_entries: [] });
    const gate = await resolveWaitlistGate(db.client, subject(), ON);

    expect(gate.held).toBe(true);
    if (!gate.held) return;
    expect(gate.entry?.email).toBe("a@example.com");
    expect(gate.entry?.source).toBe("signup");
    expect(gate.entry?.user_id).toBe("user-1");
    // An applicant the admin can't see is an applicant who never gets approved.
    expect(db.tables.waitlist_entries).toHaveLength(1);
  });

  it("lets an approved entry through", async () => {
    const db = memoryDb({
      waitlist_entries: [
        { id: "e1", email: "a@example.com", user_id: "user-1", status: "approved", queue_number: 1 },
      ],
    });
    const gate = await resolveWaitlistGate(db.client, subject(), ON);
    expect(gate.held).toBe(false);
  });

  it("matches an approval made against the email before they ever signed up", async () => {
    // The founder approves creator@x.com; that person then signs up with Google
    // for the first time. There is no user_id on the row yet — matching on
    // email is what makes "approve, then they join" work at all.
    const db = memoryDb({
      waitlist_entries: [
        { id: "e1", email: "a@example.com", user_id: null, status: "approved", queue_number: 7 },
      ],
    });
    const gate = await resolveWaitlistGate(db.client, subject(), ON);
    expect(gate.held).toBe(false);
  });

  it("links a held landing-page entry to the account that just signed in", async () => {
    const db = memoryDb({
      waitlist_entries: [
        { id: "e1", email: "a@example.com", user_id: null, status: "pending", queue_number: 3 },
      ],
    });
    const gate = await resolveWaitlistGate(db.client, subject(), ON);
    expect(gate.held).toBe(true);
    expect(db.tables.waitlist_entries[0].user_id).toBe("user-1");
    // And it reuses the existing row rather than starting a second queue entry.
    expect(db.tables.waitlist_entries).toHaveLength(1);
  });

  it("counts only PENDING entries ahead, so the number shrinks as batches go in", async () => {
    const db = memoryDb({
      waitlist_entries: [
        { id: "e1", email: "x@example.com", status: "approved", queue_number: 1 },
        { id: "e2", email: "y@example.com", status: "pending", queue_number: 2 },
        { id: "e3", email: "z@example.com", status: "rejected", queue_number: 3 },
        { id: "e4", email: "a@example.com", user_id: "user-1", status: "pending", queue_number: 4 },
      ],
    });
    const gate = await resolveWaitlistGate(db.client, subject(), ON);
    expect(gate.held).toBe(true);
    if (!gate.held) return;
    expect(gate.ahead).toBe(1); // only e2
    expect(gate.total).toBe(4);
  });

  it("auto-approves a held account when autoApprove is on", async () => {
    const flag = normalizeWaitlistFlag({
      enabled: true,
      enabledSince: SWITCH_ON_AT,
      autoApprove: true,
    });
    const db = memoryDb({ waitlist_entries: [] });
    const gate = await resolveWaitlistGate(db.client, subject(), flag);
    expect(gate.held).toBe(false);
    // They're still captured on the list — that's the point of the mode.
    expect(db.tables.waitlist_entries).toHaveLength(1);
  });

  it("fails OPEN when the database throws", async () => {
    const gate = await resolveWaitlistGate(throwingSupabase(), subject(), ON);
    expect(gate.held).toBe(false);
  });
});
