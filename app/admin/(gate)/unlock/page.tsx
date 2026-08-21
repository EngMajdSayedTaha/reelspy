import { redirect } from "next/navigation";
import { requireAdminIdentityPage } from "@/lib/admin/auth";
import { enrollmentState, readCredential } from "@/lib/admin/credentials";
import { UnlockForm } from "@/components/admin/security/UnlockForm";

export const metadata = { title: "Unlock · Admin" };

// Step-up prompt. Reachable by admins only (the parent layout 404s everyone
// else) and deliberately outside the elevation gate — this is where elevation
// comes from.
export default async function AdminUnlockPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { user, admin } = await requireAdminIdentityPage();

  // No passphrase yet (a fresh admin, or one reset out of band) — there is
  // nothing to unlock with, so send them to enrollment instead of a dead form.
  const credential = await readCredential(admin, user.id).catch(() => null);
  if (enrollmentState(credential) !== "enrolled") redirect("/admin/setup");

  // Only ever an in-app admin path: a `next` from the query string is
  // attacker-controllable, and an open redirect out of the admin gate is
  // exactly the kind of thing a phishing page would want.
  const raw = (await searchParams).next;
  const next = raw && /^\/admin(\/|$)/.test(raw) && !raw.startsWith("//") ? raw : "/admin";

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Unlock the control panel</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Signed in as {user.email}. Being an admin isn&apos;t enough on its own — enter your admin
          passphrase to open the panel on this device.
        </p>
      </div>
      <UnlockForm next={next} />
    </div>
  );
}
