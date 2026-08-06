import { describe, it, expect, vi } from "vitest";
import { entriesToCsv, reviewEntry } from "@/lib/waitlist/review";
import type { WaitlistEntry } from "@/lib/waitlist/entry";
import { memoryDb } from "@/test/helpers/memory-table";

// Both sendWaitlistApproval and sendWaitlistRejection bottom out in this one
// function — mocking here (rather than the higher-level senders) is what lets
// a single assertion confirm reviewEntry actually reaches the send path,
// which is exactly the wiring that was missing for rejections before this.
vi.mock("@/lib/email/send", () => ({ sendEmail: vi.fn().mockResolvedValue(true) }));

const entry = (over: Partial<WaitlistEntry> = {}): Record<string, unknown> => ({
  id: "e1",
  email: "a@example.com",
  user_id: null,
  source: "landing",
  status: "pending",
  queue_number: 1,
  name: null,
  instagram_handle: null,
  niche: null,
  follower_range: null,
  referral_source: null,
  note: null,
  locale: "en",
  utm: {},
  admin_note: null,
  reviewed_by: null,
  invited_at: null,
  approved_at: null,
  rejected_at: null,
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
  ...over,
});

// sendEmails is false throughout: these tests are about the state machine, and
// the sender is fail-open by construction (no RESEND_API_KEY → returns false).
const opts = { reviewedBy: "admin-1", sendEmails: false };

describe("reviewEntry", () => {
  it("approves and stamps approved_at", async () => {
    const db = memoryDb({ waitlist_entries: [entry()] });
    const res = await reviewEntry(db.client, "e1", "approved", opts);

    expect(res).not.toBeNull();
    expect(res!.entry.status).toBe("approved");
    expect(res!.entry.approved_at).not.toBeNull();
    expect(res!.newlyApproved).toBe(true);
    expect(res!.entry.reviewed_by).toBe("admin-1");
  });

  it("re-approving is a no-op that does NOT count as a new approval", async () => {
    // This is what makes bulk-approving a filtered page safe to click twice:
    // nobody gets a second "you're in" email.
    const db = memoryDb({
      waitlist_entries: [entry({ status: "approved", approved_at: "2026-08-02T00:00:00.000Z" })],
    });
    const res = await reviewEntry(db.client, "e1", "approved", opts);

    expect(res!.newlyApproved).toBe(false);
    expect(res!.entry.approved_at).toBe("2026-08-02T00:00:00.000Z");
  });

  it("clears the decision timestamps when an entry is put back to pending", async () => {
    const db = memoryDb({
      waitlist_entries: [entry({ status: "approved", approved_at: "2026-08-02T00:00:00.000Z" })],
    });
    const res = await reviewEntry(db.client, "e1", "pending", opts);

    expect(res!.entry.status).toBe("pending");
    expect(res!.entry.approved_at).toBeNull();
  });

  it("shortlisting does not grant access", async () => {
    // 'invited' is a triage label. Only 'approved' opens the gate — see the
    // status table at the top of lib/waitlist/review.ts.
    const db = memoryDb({ waitlist_entries: [entry()] });
    const res = await reviewEntry(db.client, "e1", "invited", opts);

    expect(res!.entry.status).toBe("invited");
    expect(res!.entry.invited_at).not.toBeNull();
    expect(res!.newlyApproved).toBe(false);
  });

  it("returns null for an entry that isn't there", async () => {
    const db = memoryDb({ waitlist_entries: [] });
    expect(await reviewEntry(db.client, "missing", "approved", opts)).toBeNull();
  });

  it("rejects and stamps rejected_at", async () => {
    const db = memoryDb({ waitlist_entries: [entry()] });
    const res = await reviewEntry(db.client, "e1", "rejected", opts);

    expect(res!.entry.status).toBe("rejected");
    expect(res!.entry.rejected_at).not.toBeNull();
    expect(res!.newlyRejected).toBe(true);
    expect(res!.newlyApproved).toBe(false);
  });

  it("re-rejecting is a no-op that does NOT count as a new rejection", async () => {
    const db = memoryDb({
      waitlist_entries: [entry({ status: "rejected", rejected_at: "2026-08-02T00:00:00.000Z" })],
    });
    const res = await reviewEntry(db.client, "e1", "rejected", opts);

    expect(res!.newlyRejected).toBe(false);
    expect(res!.entry.rejected_at).toBe("2026-08-02T00:00:00.000Z");
  });

  describe("email side effects (sendEmails: true)", () => {
    const emailOpts = { reviewedBy: "admin-1", sendEmails: true };

    it("sends the approval email on a newly-approved transition", async () => {
      const { sendEmail } = await import("@/lib/email/send");
      vi.mocked(sendEmail).mockClear();

      const db = memoryDb({ waitlist_entries: [entry({ email: "a@example.com" })] });
      const res = await reviewEntry(db.client, "e1", "approved", emailOpts);

      expect(res!.emailSent).toBe(true);
      expect(sendEmail).toHaveBeenCalledTimes(1);
      const call = vi.mocked(sendEmail).mock.calls[0]![0];
      expect(call.to).toBe("a@example.com");
      expect(call.subject.toLowerCase()).toContain("open");
    });

    // This is the actual bug reported: a rejected applicant got no email at
    // all, because reviewEntry only ever called the approval sender.
    it("sends a rejection email on a newly-rejected transition", async () => {
      const { sendEmail } = await import("@/lib/email/send");
      vi.mocked(sendEmail).mockClear();

      const db = memoryDb({ waitlist_entries: [entry({ email: "a@example.com" })] });
      const res = await reviewEntry(db.client, "e1", "rejected", emailOpts);

      expect(res!.emailSent).toBe(true);
      expect(sendEmail).toHaveBeenCalledTimes(1);
      const call = vi.mocked(sendEmail).mock.calls[0]![0];
      expect(call.to).toBe("a@example.com");
      expect(call.subject.toLowerCase()).toContain("update");
    });

    it("sends no email for a shortlist or a re-decision", async () => {
      const { sendEmail } = await import("@/lib/email/send");
      vi.mocked(sendEmail).mockClear();

      const db = memoryDb({
        waitlist_entries: [entry({ email: "a@example.com", status: "rejected" })],
      });
      // Already rejected — re-applying the same status must not re-send.
      await reviewEntry(db.client, "e1", "rejected", emailOpts);
      expect(sendEmail).not.toHaveBeenCalled();
    });
  });
});

describe("entriesToCsv", () => {
  const rows = [
    entry({ email: "a@example.com", name: "Majd", niche: "fitness" }),
    entry({ id: "e2", email: "b@example.com", name: 'He said "hi", loudly', queue_number: 2 }),
  ] as unknown as WaitlistEntry[];

  it("emits a header row and one line per entry", () => {
    const lines = entriesToCsv(rows).split("\r\n");
    expect(lines[0]).toContain("email");
    expect(lines).toHaveLength(3);
  });

  it("quotes and escapes cells containing commas or quotes", () => {
    const csv = entriesToCsv(rows);
    expect(csv).toContain('"He said ""hi"", loudly"');
  });

  it("defuses spreadsheet formula injection", () => {
    // The founder opens this in Excel. A name of =HYPERLINK(...) must land as
    // text, not as a formula that runs on open.
    const csv = entriesToCsv([entry({ name: "=HYPERLINK(\"http://evil\")" })] as unknown as WaitlistEntry[]);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).not.toMatch(/,=HYPERLINK/);
  });

  it("renders a linked account as a plain yes/no", () => {
    const csv = entriesToCsv([entry({ user_id: "user-1" })] as unknown as WaitlistEntry[]);
    expect(csv.split("\r\n")[1]).toContain("yes");
  });
});
