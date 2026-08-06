import { describe, it, expect } from "vitest";
import { joinWaitlist, normalizeEmail, normalizeHandle, hashIp, isEmailApproved } from "@/lib/waitlist/entry";
import { memoryDb } from "@/test/helpers/memory-table";
import { throwingSupabase } from "@/test/helpers/fake-supabase";

describe("normalizeEmail", () => {
  it("lowercases and trims, so the unique index sees one applicant", () => {
    expect(normalizeEmail("  Majd@Example.COM ")).toBe("majd@example.com");
  });
});

describe("normalizeHandle", () => {
  it("strips the @ people habitually type", () => {
    expect(normalizeHandle("@reelspy")).toBe("reelspy");
    expect(normalizeHandle("reelspy")).toBe("reelspy");
  });

  it("accepts a pasted profile URL", () => {
    expect(normalizeHandle("https://www.instagram.com/reelspy/")).toBe("reelspy");
    expect(normalizeHandle("instagram.com/reelspy?hl=en")).toBe("instagram.com"); // no scheme → not a URL we unwrap
    expect(normalizeHandle("https://instagram.com/reelspy?hl=en")).toBe("reelspy");
  });

  it("returns null for nothing", () => {
    expect(normalizeHandle("")).toBeNull();
    expect(normalizeHandle(null)).toBeNull();
    expect(normalizeHandle("@")).toBeNull();
  });
});

describe("hashIp", () => {
  it("is stable for the same address and different across addresses", () => {
    expect(hashIp("1.2.3.4")).toBe(hashIp("1.2.3.4"));
    expect(hashIp("1.2.3.4")).not.toBe(hashIp("1.2.3.5"));
  });

  it("never contains the address it hashed", () => {
    expect(hashIp("203.0.113.9")).not.toContain("203");
  });
});

describe("joinWaitlist", () => {
  const db = () => memoryDb({ waitlist_entries: [] });

  it("creates an entry and assigns a queue number", async () => {
    const { client } = db();
    const res = await joinWaitlist(client, { email: "a@example.com", source: "landing" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.created).toBe(true);
    expect(res.entry.status).toBe("pending");
    expect(res.entry.queue_number).toBe(1);
  });

  it("is idempotent — re-submitting the same address is a success, not a duplicate", async () => {
    const { client, tables } = db();
    await joinWaitlist(client, { email: "a@example.com", source: "landing" });
    const again = await joinWaitlist(client, { email: "a@example.com", source: "landing" });

    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.created).toBe(false);
    expect(tables.waitlist_entries).toHaveLength(1);
  });

  it("keeps the original queue number and status on a re-submit", async () => {
    const { client, tables } = db();
    await joinWaitlist(client, { email: "first@example.com", source: "landing" });
    await joinWaitlist(client, { email: "a@example.com", source: "landing" });
    tables.waitlist_entries[1].status = "approved";

    const again = await joinWaitlist(client, { email: "a@example.com", source: "signup", name: "Majd" });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    // An admin decision and a place in line are not things a form re-submit
    // gets to reset.
    expect(again.entry.status).toBe("approved");
    expect(again.entry.queue_number).toBe(2);
  });

  it("merges only fields that were empty — a bare re-link can't blank a niche", async () => {
    const { client } = db();
    await joinWaitlist(client, {
      email: "a@example.com",
      source: "landing",
      niche: "fitness",
      name: "Majd",
    });

    const linked = await joinWaitlist(client, {
      email: "A@Example.com",
      source: "signup",
      userId: "user-1",
      name: "Someone Else",
    });

    expect(linked.ok).toBe(true);
    if (!linked.ok) return;
    expect(linked.entry.user_id).toBe("user-1"); // newly filled
    expect(linked.entry.niche).toBe("fitness"); // untouched
    expect(linked.entry.name).toBe("Majd"); // NOT overwritten
  });

  it("approves immediately when autoApprove is on", async () => {
    const { client } = db();
    const res = await joinWaitlist(client, {
      email: "a@example.com",
      source: "landing",
      autoApprove: true,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.entry.status).toBe("approved");
    expect(res.entry.approved_at).not.toBeNull();
  });

  it("normalizes the handle it stores", async () => {
    const { client } = db();
    const res = await joinWaitlist(client, {
      email: "a@example.com",
      source: "landing",
      instagramHandle: "@ReelSpy",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.entry.instagram_handle).toBe("ReelSpy");
  });
});

describe("isEmailApproved", () => {
  // This is what lets someone who joined ONLY via the landing form (no
  // account, no session) reach the real signup form after being approved —
  // /signup?email= trusts this check, never the query param on its own.
  it("is true only for a status of exactly 'approved'", async () => {
    const db = memoryDb({
      waitlist_entries: [
        { id: "e1", email: "approved@example.com", status: "approved", queue_number: 1 },
        { id: "e2", email: "pending@example.com", status: "pending", queue_number: 2 },
        { id: "e3", email: "rejected@example.com", status: "rejected", queue_number: 3 },
      ],
    });
    expect(await isEmailApproved(db.client, "approved@example.com")).toBe(true);
    expect(await isEmailApproved(db.client, "pending@example.com")).toBe(false);
    expect(await isEmailApproved(db.client, "rejected@example.com")).toBe(false);
  });

  it("matches case- and whitespace-insensitively, like every other lookup here", async () => {
    const db = memoryDb({
      waitlist_entries: [{ id: "e1", email: "approved@example.com", status: "approved", queue_number: 1 }],
    });
    expect(await isEmailApproved(db.client, "  Approved@Example.COM ")).toBe(true);
  });

  it("is false for an address that was never on the list", async () => {
    const db = memoryDb({ waitlist_entries: [] });
    expect(await isEmailApproved(db.client, "nobody@example.com")).toBe(false);
  });

  it("fails CLOSED on a DB error — this check only ever widens access", async () => {
    expect(await isEmailApproved(throwingSupabase(), "approved@example.com")).toBe(false);
  });
});
