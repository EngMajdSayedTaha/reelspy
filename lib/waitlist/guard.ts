import "server-only";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/billing/admin";
import { readWaitlistFlag } from "@/lib/waitlist/flag";
import { resolveWaitlistGate, type WaitlistGate } from "@/lib/waitlist/access";

// The one line the dashboard layout adds. Everything expensive is behind the
// flag check, so when the waiting list is off (the normal state) this costs a
// single primary-key lookup on a table with a handful of rows — and zero extra
// queries.
//
// Fails OPEN on any error: an unapplied migration, a missing service-role key
// or a transient DB failure must let people into the product they paid for, not
// bounce every customer to a "you're on the list" screen.

export async function guardDashboardAccess(authUser: User | null): Promise<void> {
  if (!authUser) return; // middleware already sends signed-out users to /login

  try {
    const admin = createAdminClient();
    const flag = await readWaitlistFlag(admin);
    if (!flag.enabled) return;

    const supabase = await createClient();
    const isAdmin = await isAdminUser(supabase, authUser.id).catch(() => false);

    const gate = await resolveWaitlistGate(
      admin,
      {
        userId: authUser.id,
        email: authUser.email ?? null,
        accountCreatedAt: authUser.created_at ?? null,
        isAdmin,
      },
      flag
    );

    if (gate.held) redirect("/waitlist");
  } catch (err) {
    // next/navigation's redirect() signals by throwing a special error, which
    // must be allowed to propagate — swallowing it would silently cancel the
    // redirect and drop a held user straight into the dashboard.
    if (isRedirectError(err)) throw err;
    console.warn("[waitlist] guard threw; allowing:", err instanceof Error ? err.message : err);
  }
}

// Next marks its control-flow errors with a `digest` of "NEXT_REDIRECT;…".
// There's no public type guard for this, so match the documented prefix.
function isRedirectError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    typeof (err as { digest?: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

/**
 * The pending screen's own data load. Returns the gate result for a signed-in
 * visitor, or null when they aren't signed in / aren't held (in which case the
 * page shows the public join form or sends them to the dashboard).
 */
export async function loadWaitlistStatus(authUser: User | null): Promise<WaitlistGate | null> {
  if (!authUser) return null;
  try {
    const admin = createAdminClient();
    const supabase = await createClient();
    const isAdmin = await isAdminUser(supabase, authUser.id).catch(() => false);
    return await resolveWaitlistGate(admin, {
      userId: authUser.id,
      email: authUser.email ?? null,
      accountCreatedAt: authUser.created_at ?? null,
      isAdmin,
    });
  } catch {
    return null;
  }
}
