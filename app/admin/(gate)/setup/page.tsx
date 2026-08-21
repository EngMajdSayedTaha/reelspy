import { redirect } from "next/navigation";
import { requireAdminIdentityPage } from "@/lib/admin/auth";
import { enrollmentState, readCredential } from "@/lib/admin/credentials";
import { SetupForm } from "@/components/admin/security/SetupForm";

export const metadata = { title: "Set up admin access · Admin" };

// First-time enrollment, and the recovery path for a forgotten passphrase.
// Requires a one-time code minted with the service-role key — see
// components/admin/security/SetupForm.tsx for why that indirection is the
// point rather than an inconvenience.
export default async function AdminSetupPage() {
  const { user, admin } = await requireAdminIdentityPage();
  const credential = await readCredential(admin, user.id).catch(() => null);
  const state = enrollmentState(credential);

  // Already enrolled: the way to a NEW passphrase is /admin/security (which
  // asks for the current one), not this screen.
  if (state === "enrolled") redirect("/admin/unlock");

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Set your admin passphrase</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One more secret, separate from your account password, that the control panel asks for
          before it opens. Signed in as {user.email}.
        </p>
      </div>
      <SetupForm email={user.email ?? null} invited={state === "invited"} />
    </div>
  );
}
