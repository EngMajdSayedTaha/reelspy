import { createAdminClient } from "@/lib/supabase/admin";
import { readWaitlistFlag } from "@/lib/waitlist/flag";
import { countWaitlist, isEmailApproved } from "@/lib/waitlist/entry";
import { AuthShell } from "@/components/auth/AuthShell";
import { SignupForm } from "@/components/auth/SignupForm";
import { WaitlistForm } from "@/components/waitlist/WaitlistForm";

// Reads the live waitlist flag (and, when present, verifies ?email=) on every
// request.
export const dynamic = "force-dynamic";

// While the waiting list is on, /signup shows the join form instead of the
// account form. This is a FUNNEL decision, not a security control — sign-up
// runs client-side against Supabase Auth, so nothing here can actually stop
// someone from creating an account. The enforceable gate is on the dashboard
// (lib/waitlist/guard.ts): an account created around this page still lands on
// "you're #47 in line". See the note at the top of lib/waitlist/access.ts.
//
// EXCEPT one case, which is why this page also reads `?email=`. The gate can
// only hold someone once they have an account — someone who joined ONLY via
// the landing form has neither a session nor a way to ever reach the real
// account form, since /signup shows the join form to every visitor by
// default. Their approval email links here with their address in the query
// string (lib/waitlist/email.ts); this page verifies that EXACT address is
// actually approved (isEmailApproved — a server-side DB lookup, never trusts
// the param on its own) before swapping in the real SignupForm. Without this,
// an approved landing-only applicant hits a closed loop: join form → "already
// on the list" → no way forward.
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email: approvedEmailParam } = await searchParams;

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

  if (enabled && approvedEmailParam) {
    const bypass = await checkApprovedBypass(approvedEmailParam);
    if (bypass) return <SignupForm defaultEmail={approvedEmailParam} />;
  }

  if (enabled) {
    return (
      <AuthShell>
        <WaitlistForm total={total} defaultEmail={approvedEmailParam} />
      </AuthShell>
    );
  }

  return <SignupForm />;
}

async function checkApprovedBypass(email: string): Promise<boolean> {
  try {
    return await isEmailApproved(createAdminClient(), email);
  } catch {
    return false;
  }
}
