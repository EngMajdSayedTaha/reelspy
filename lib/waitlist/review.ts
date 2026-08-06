import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ENTRY_COLUMNS, type WaitlistEntry, type WaitlistStatus } from "@/lib/waitlist/entry";
import { sendWaitlistApproval } from "@/lib/waitlist/email";

// Status transitions, in one place, because both the row actions and the bulk
// action need identical behaviour (including who gets an email).
//
// What the four states MEAN — the gate only ever looks at one of them:
//
//   pending   Waiting. The default.
//   invited   Shortlisted / reached out to. A triage label for working the
//             queue; it does NOT grant access. Deliberately not "we emailed an
//             invite": the approval email IS the invite, so a second state for
//             that would just be a way to disagree with reality.
//   approved  Access granted. This is the ONLY state resolveWaitlistGate lets
//             through, and the only one that sends an email.
//   rejected  Declined. Kept rather than deleted so the same address doesn't
//             quietly reappear at the top of the queue tomorrow.

export const REVIEW_STATUSES = ["pending", "invited", "approved", "rejected"] as const;

export type ReviewResult = {
  entry: WaitlistEntry;
  /** True when this call is what flipped them to approved (so: email sent). */
  newlyApproved: boolean;
  emailSent: boolean;
};

/**
 * Move one entry to `status`. Idempotent: re-approving an already-approved
 * entry is a no-op that sends no second email — the timestamps are only stamped
 * on an actual transition, which is what makes bulk-approving a filtered page
 * safe to click twice.
 */
export async function reviewEntry(
  admin: SupabaseClient,
  entryId: string,
  status: WaitlistStatus,
  opts: { reviewedBy: string; adminNote?: string | null; sendEmails: boolean }
): Promise<ReviewResult | null> {
  const { data: before } = await admin
    .from("waitlist_entries")
    .select(ENTRY_COLUMNS)
    .eq("id", entryId)
    .maybeSingle();
  if (!before) return null;
  const prev = before as WaitlistEntry;

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status, reviewed_by: opts.reviewedBy };
  if (opts.adminNote !== undefined) patch.admin_note = opts.adminNote;

  const transitioned = prev.status !== status;
  if (transitioned) {
    if (status === "approved") patch.approved_at = now;
    if (status === "invited") patch.invited_at = now;
    if (status === "rejected") patch.rejected_at = now;
    // Returning to pending clears the decision timestamps, so a row that was
    // approved by mistake doesn't keep claiming it was approved.
    if (status === "pending") {
      patch.approved_at = null;
      patch.rejected_at = null;
    }
  }

  const { data: updated, error } = await admin
    .from("waitlist_entries")
    .update(patch)
    .eq("id", entryId)
    .select(ENTRY_COLUMNS)
    .maybeSingle();
  if (error || !updated) return null;
  const entry = updated as WaitlistEntry;

  const newlyApproved = transitioned && status === "approved";
  let emailSent = false;
  if (newlyApproved && opts.sendEmails) {
    emailSent = await sendWaitlistApproval({
      to: entry.email,
      name: entry.name,
      hasAccount: Boolean(entry.user_id),
    });
  }

  return { entry, newlyApproved, emailSent };
}

/** CSV of the whole list, for the founder's own analysis / mail merge. */
export function entriesToCsv(rows: WaitlistEntry[]): string {
  const headers = [
    "queue_number",
    "email",
    "name",
    "instagram_handle",
    "niche",
    "follower_range",
    "referral_source",
    "status",
    "source",
    "locale",
    "has_account",
    "note",
    "admin_note",
    "created_at",
    "approved_at",
  ];
  const cell = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    // Quote everything that could break a cell, and double any embedded quote.
    // The leading-character guard stops a spreadsheet treating a pasted "=..."
    // value as a formula (CSV injection) when the founder opens this in Excel.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };

  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.queue_number,
        r.email,
        r.name,
        r.instagram_handle,
        r.niche,
        r.follower_range,
        r.referral_source,
        r.status,
        r.source,
        r.locale,
        r.user_id ? "yes" : "no",
        r.note,
        r.admin_note,
        r.created_at,
        r.approved_at,
      ]
        .map(cell)
        .join(",")
    );
  }
  return lines.join("\r\n");
}
