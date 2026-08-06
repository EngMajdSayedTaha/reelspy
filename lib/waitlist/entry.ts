import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

// Shared shapes + normalization for waitlist rows. Everything that writes an
// entry — the public landing form, the signed-in gate, the admin panel — goes
// through here so the email-normalization rule (the thing the unique index
// depends on) is stated exactly once.

export type WaitlistStatus = "pending" | "invited" | "approved" | "rejected";
export type WaitlistSource = "landing" | "signup" | "admin";

export type WaitlistEntry = {
  id: string;
  email: string;
  user_id: string | null;
  source: string;
  status: WaitlistStatus;
  queue_number: number;
  name: string | null;
  instagram_handle: string | null;
  niche: string | null;
  follower_range: string | null;
  referral_source: string | null;
  note: string | null;
  locale: string | null;
  utm: Record<string, unknown>;
  admin_note: string | null;
  reviewed_by: string | null;
  invited_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * The canonical form of an email for this table. The unique index is on
 * `lower(email)`, so storing anything else would let "Majd@x.com" and
 * "majd@x.com" become two applicants. Trim first: pasted addresses routinely
 * carry a trailing space.
 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Strip a leading @ and any profile-URL wrapper off an Instagram handle. */
export function normalizeHandle(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/+$/, "");
  const handle = trimmed.replace(/^@+/, "").split(/[?#/]/)[0] ?? "";
  return handle ? handle.slice(0, 60) : null;
}

/**
 * Opaque, salted bucket key for the anonymous throttle. We never store or log
 * the raw IP: the only thing the limiter needs is "is this the same caller as a
 * moment ago", which a hash answers. Salted with the service-role key (always
 * present server-side, never shipped to a client) so the digests aren't a
 * rainbow-table away from the original addresses.
 */
export function hashIp(ip: string): string {
  const salt = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "reelspy";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 48);
}

/** First hop of x-forwarded-for, else x-real-ip, else a shared fallback bucket. */
export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export type JoinInput = {
  email: string;
  name?: string | null;
  instagramHandle?: string | null;
  niche?: string | null;
  followerRange?: string | null;
  referralSource?: string | null;
  note?: string | null;
  locale?: string | null;
  utm?: Record<string, unknown>;
  source: WaitlistSource;
  userId?: string | null;
  ipHash?: string | null;
  userAgent?: string | null;
  /** Set by the caller from the flag; a joined entry is approved immediately. */
  autoApprove?: boolean;
};

export type JoinResult =
  | { ok: true; entry: WaitlistEntry; created: boolean }
  | { ok: false; reason: "error" };

export const ENTRY_COLUMNS =
  "id, email, user_id, source, status, queue_number, name, instagram_handle, niche, follower_range, referral_source, note, locale, utm, admin_note, reviewed_by, invited_at, approved_at, rejected_at, created_at, updated_at";

/**
 * Idempotently put someone on the list.
 *
 * Re-submitting an address is a SUCCESS, not an error — the person clicked the
 * button twice, or joined from the landing page and later signed up with the
 * same address. Both are the same applicant, so the existing row wins and only
 * the fields they actually filled in this time are merged over it. Two things
 * are never overwritten by a re-submit: `status` (an admin decision) and
 * `queue_number` (their place in line).
 *
 * Requires the service-role client — waitlist_entries has RLS on with no
 * policies.
 */
export async function joinWaitlist(
  admin: SupabaseClient,
  input: JoinInput
): Promise<JoinResult> {
  const email = normalizeEmail(input.email);
  const now = new Date().toISOString();

  try {
    const { data: existing } = await admin
      .from("waitlist_entries")
      .select(ENTRY_COLUMNS)
      .eq("email", email)
      .maybeSingle();

    if (existing) {
      const prev = existing as WaitlistEntry;
      // Only non-empty incoming values are merged, so a bare signed-in link
      // ("here's my user_id") can't blank out the niche someone typed on the
      // landing page a week earlier.
      const patch: Record<string, unknown> = {};
      if (input.userId && !prev.user_id) patch.user_id = input.userId;
      if (input.name?.trim() && !prev.name) patch.name = input.name.trim().slice(0, 120);
      const handle = normalizeHandle(input.instagramHandle);
      if (handle && !prev.instagram_handle) patch.instagram_handle = handle;
      if (input.niche?.trim() && !prev.niche) patch.niche = input.niche.trim().slice(0, 80);
      if (input.followerRange && !prev.follower_range) patch.follower_range = input.followerRange;
      if (input.referralSource?.trim() && !prev.referral_source)
        patch.referral_source = input.referralSource.trim().slice(0, 120);
      if (input.note?.trim() && !prev.note) patch.note = input.note.trim().slice(0, 1000);
      if (input.locale && !prev.locale) patch.locale = input.locale;

      if (Object.keys(patch).length === 0) return { ok: true, entry: prev, created: false };

      const { data: updated, error } = await admin
        .from("waitlist_entries")
        .update(patch)
        .eq("id", prev.id)
        .select(ENTRY_COLUMNS)
        .maybeSingle();
      if (error) return { ok: true, entry: prev, created: false };
      return { ok: true, entry: (updated ?? prev) as WaitlistEntry, created: false };
    }

    const approved = input.autoApprove === true;
    const { data: inserted, error } = await admin
      .from("waitlist_entries")
      .insert({
        email,
        user_id: input.userId ?? null,
        source: input.source,
        status: approved ? "approved" : "pending",
        approved_at: approved ? now : null,
        name: input.name?.trim().slice(0, 120) || null,
        instagram_handle: normalizeHandle(input.instagramHandle),
        niche: input.niche?.trim().slice(0, 80) || null,
        follower_range: input.followerRange || null,
        referral_source: input.referralSource?.trim().slice(0, 120) || null,
        note: input.note?.trim().slice(0, 1000) || null,
        locale: input.locale ?? null,
        utm: input.utm ?? {},
        ip_hash: input.ipHash ?? null,
        user_agent: input.userAgent?.slice(0, 400) ?? null,
      })
      .select(ENTRY_COLUMNS)
      .maybeSingle();

    if (error) {
      // 23505 = someone else inserted the same email between our SELECT and our
      // INSERT. Re-read rather than fail: concurrency is not the caller's problem.
      if ((error as { code?: string }).code === "23505") {
        const { data: raced } = await admin
          .from("waitlist_entries")
          .select(ENTRY_COLUMNS)
          .eq("email", email)
          .maybeSingle();
        if (raced) return { ok: true, entry: raced as WaitlistEntry, created: false };
      }
      console.warn("[waitlist] insert failed:", error.message);
      return { ok: false, reason: "error" };
    }
    if (!inserted) return { ok: false, reason: "error" };
    return { ok: true, entry: inserted as WaitlistEntry, created: true };
  } catch (err) {
    console.warn("[waitlist] join threw:", err instanceof Error ? err.message : err);
    return { ok: false, reason: "error" };
  }
}

/** Total entries on the list — the social-proof number on the public form. */
export async function countWaitlist(admin: SupabaseClient): Promise<number> {
  try {
    const { count } = await admin
      .from("waitlist_entries")
      .select("id", { count: "exact", head: true });
    return count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Is this exact email address currently approved?
 *
 * Exists for one purpose: someone who joined the list WITHOUT ever creating an
 * account (the common case — they only ever filled in the landing-page form)
 * has no session, so the dashboard gate (which checks by user_id/email on an
 * authenticated request) never gets a chance to run for them. The approval
 * email's "Create your account" link carries `?email=`, and /signup uses this
 * check to decide whether to show the real account form instead of the join
 * form for that one verified address. See app/signup/page.tsx.
 *
 * Fails CLOSED (false) on any error: this check only ever WIDENS access past
 * the join form, so erring toward "not approved" just re-shows the join form
 * — it never locks anyone out of access they already have.
 */
export async function isEmailApproved(admin: SupabaseClient, email: string): Promise<boolean> {
  try {
    const { data } = await admin
      .from("waitlist_entries")
      .select("status")
      .eq("email", normalizeEmail(email))
      .maybeSingle();
    return (data as { status?: string } | null)?.status === "approved";
  } catch {
    return false;
  }
}
