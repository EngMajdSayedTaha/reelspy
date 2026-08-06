import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { readWaitlistFlag } from "@/lib/waitlist/flag";
import { countWaitlist } from "@/lib/waitlist/entry";
import { loadWaitlistStatus } from "@/lib/waitlist/guard";
import { AuthShell } from "@/components/auth/AuthShell";
import { WaitlistForm } from "@/components/waitlist/WaitlistForm";
import { WaitlistPending } from "@/components/waitlist/WaitlistPending";

export const metadata: Metadata = {
  title: "Waiting list",
  // A closed-beta holding page has no business in search results, and indexing
  // it would out-rank the real marketing page for brand queries.
  robots: { index: false, follow: false },
};

// Always live: it renders the current flag state and a live queue position.
export const dynamic = "force-dynamic";

// The closed-beta screen, serving three visitors:
//
//   signed in + held      → their place in line (the common case; this is where
//                           guardDashboardAccess sends people)
//   signed in + let in    → straight to the dashboard, so a stale tab or a
//                           bookmarked /waitlist doesn't strand an approved user
//   signed out            → the join form, or /signup if the gate is open
export default async function WaitlistPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));

  let enabled = false;
  let total = 0;
  try {
    const admin = createAdminClient();
    const flag = await readWaitlistFlag(admin);
    enabled = flag.enabled;
    if (enabled) total = await countWaitlist(admin);
  } catch {
    enabled = false;
  }

  if (user) {
    const gate = await loadWaitlistStatus(user);
    // Not held — either the list is off or they've been approved. Either way
    // the product is open to them and this page is the wrong place to be.
    if (!gate || !gate.held) redirect("/dashboard");

    return (
      <AuthShell>
        <WaitlistPending
          email={user.email ?? null}
          queueNumber={gate.entry?.queue_number ?? null}
          ahead={gate.ahead}
          total={gate.total}
        />
      </AuthShell>
    );
  }

  // Signed out and the gate is open: nothing to wait for.
  if (!enabled) redirect("/signup");

  return (
    <AuthShell>
      <WaitlistForm total={total} />
    </AuthShell>
  );
}
