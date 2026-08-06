import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readWaitlistFlag, type WaitlistFlag } from "@/lib/waitlist/flag";
import { ENTRY_COLUMNS, joinWaitlist, normalizeEmail, type WaitlistEntry } from "@/lib/waitlist/entry";

// Does this signed-in account get into the product right now?
//
// The gate is on the DASHBOARD, not on account creation. That is the important
// design decision here, so it's worth stating why:
//
//   Sign-up runs client-side against Supabase Auth (and, for Google, entirely
//   inside the OAuth provider). The app never sits in the middle of it, so an
//   app-level "signups are closed" check is decoration — anyone can call the
//   Supabase client directly. Blocking at the product boundary instead is
//   enforceable, works identically for email and Google, and gives a much
//   better funnel: one tap to sign up, land on "you're #47 in line", and get
//   let in automatically the moment an admin approves — no invite codes, no
//   second credential system, no lost accounts.
//
// Access is granted when ANY of these hold:
//
//   1. The waitlist is off.                       (the normal state)
//   2. The account is an admin.                   (never lock the founder out)
//   3. The account predates the switch being      (grandfathering — flipping the
//      turned on.                                  switch must never lock out an
//                                                   existing, possibly paying,
//                                                   customer)
//   4. Their entry is 'approved'.                 (the actual approval path)
//
// Otherwise they're held, and we make sure a row exists for them so they show
// up in the admin review queue instead of vanishing.

export type WaitlistGate =
  | { held: false }
  | {
      held: true;
      entry: WaitlistEntry | null;
      /** How many pending applicants joined before them. */
      ahead: number;
      total: number;
    };

export type GateSubject = {
  userId: string;
  email: string | null;
  /** auth.users.created_at — already on the User object, so this costs nothing. */
  accountCreatedAt: string | null;
  isAdmin: boolean;
  locale?: string | null;
};

const PASS: WaitlistGate = { held: false };

/**
 * Resolve the gate for one account. `admin` must be the service-role client.
 *
 * Fails OPEN (grants access) on any unexpected error — see readWaitlistFlag for
 * the reasoning: a DB blip must never look like "the whole customer base is
 * locked out". Pass a pre-read `flag` when the caller already has one.
 */
export async function resolveWaitlistGate(
  admin: SupabaseClient,
  subject: GateSubject,
  flag?: WaitlistFlag
): Promise<WaitlistGate> {
  try {
    const f = flag ?? (await readWaitlistFlag(admin));
    if (!f.enabled) return PASS;
    if (subject.isAdmin) return PASS;

    // Grandfathering. `enabledSince` is stamped on every off→on transition, so
    // this window is "accounts that existed when the gate closed".
    if (f.enabledSince && subject.accountCreatedAt) {
      if (Date.parse(subject.accountCreatedAt) < Date.parse(f.enabledSince)) return PASS;
    }

    const email = subject.email ? normalizeEmail(subject.email) : null;

    // Match on user_id first (authoritative once linked), then on email — the
    // usual case being someone who joined from the landing page and is now
    // signing in for the first time.
    let entry: WaitlistEntry | null = null;
    const byUser = await admin
      .from("waitlist_entries")
      .select(ENTRY_COLUMNS)
      .eq("user_id", subject.userId)
      .maybeSingle();
    entry = (byUser.data as WaitlistEntry | null) ?? null;

    if (!entry && email) {
      const byEmail = await admin
        .from("waitlist_entries")
        .select(ENTRY_COLUMNS)
        .eq("email", email)
        .maybeSingle();
      entry = (byEmail.data as WaitlistEntry | null) ?? null;
    }

    if (entry?.status === "approved") return PASS;

    // Held. Make sure they're actually in the queue — an account that signed up
    // while the gate was closed has no row yet, and an applicant the admin can't
    // see is an applicant who never gets approved. joinWaitlist is idempotent
    // and links user_id onto a landing-page row with the same address.
    if (!entry && email) {
      const joined = await joinWaitlist(admin, {
        email,
        source: "signup",
        userId: subject.userId,
        locale: subject.locale ?? null,
        autoApprove: f.autoApprove,
      });
      if (joined.ok) {
        entry = joined.entry;
        if (entry.status === "approved") return PASS;
      }
    } else if (entry && !entry.user_id) {
      // Link the landing-page row to the account that just signed in, so the
      // admin sees "applied, then signed up" as one person. Best-effort: the
      // link is a nicety, and failing it must not cost them the screen that
      // tells them where they are in the queue.
      try {
        await admin.from("waitlist_entries").update({ user_id: subject.userId }).eq("id", entry.id);
        entry = { ...entry, user_id: subject.userId };
      } catch {
        // keep going with the unlinked entry
      }
    }

    const [ahead, total] = await Promise.all([countAhead(admin, entry), countAll(admin)]);

    return { held: true, entry, ahead, total };
  } catch (err) {
    console.warn("[waitlist] gate threw; allowing:", err instanceof Error ? err.message : err);
    return PASS;
  }
}

// "You're 46th in line" is computed, not stored: queue_number is a stable join
// ticket that never moves, but the number people care about shrinks as those
// ahead of them get approved. Counting pending rows with a lower ticket gives
// the honest, monotonically-decreasing answer.
async function countAhead(admin: SupabaseClient, entry: WaitlistEntry | null): Promise<number> {
  if (!entry) return 0;
  try {
    const { count } = await admin
      .from("waitlist_entries")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .lt("queue_number", entry.queue_number);
    return count ?? 0;
  } catch {
    return 0;
  }
}

async function countAll(admin: SupabaseClient): Promise<number> {
  try {
    const { count } = await admin
      .from("waitlist_entries")
      .select("id", { count: "exact", head: true });
    return count ?? 0;
  } catch {
    return 0;
  }
}
