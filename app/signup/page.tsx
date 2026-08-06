import { createAdminClient } from "@/lib/supabase/admin";
import { readWaitlistFlag } from "@/lib/waitlist/flag";
import { countWaitlist } from "@/lib/waitlist/entry";
import { AuthShell } from "@/components/auth/AuthShell";
import { SignupForm } from "@/components/auth/SignupForm";
import { WaitlistForm } from "@/components/waitlist/WaitlistForm";

// Reads the live waitlist flag on every request.
export const dynamic = "force-dynamic";

// While the waiting list is on, /signup shows the join form instead of the
// account form. This is a FUNNEL decision, not a security control — sign-up
// runs client-side against Supabase Auth, so nothing here can actually stop
// someone from creating an account. The enforceable gate is on the dashboard
// (lib/waitlist/guard.ts): an account created around this page still lands on
// "you're #47 in line". See the note at the top of lib/waitlist/access.ts.
export default async function SignupPage() {
  let enabled = false;
  let total = 0;
  try {
    const admin = createAdminClient();
    const flag = await readWaitlistFlag(admin);
    enabled = flag.enabled;
    if (enabled) total = await countWaitlist(admin);
  } catch {
    // Unprovisioned service-role key → the normal signup form. Fail toward
    // letting people in, never toward a dead-end page.
    enabled = false;
  }

  if (enabled) {
    return (
      <AuthShell>
        <WaitlistForm total={total} />
      </AuthShell>
    );
  }

  return <SignupForm />;
}
